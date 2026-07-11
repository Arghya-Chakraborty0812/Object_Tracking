import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io({
  transports: ["websocket"],
  upgrade: false,
});

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [output, setOutput] = useState("");
  const [connected, setConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [clock, setClock] = useState(new Date());
  const [streaming, setStreaming] = useState(true);

  const lastFrameTime = useRef(Date.now());
  const streamRef = useRef(null);
  const sendingRef = useRef(false); // in-flight guard: true while a frame is being sent AND awaiting its result
  const streamingRef = useRef(true); // mirrors `streaming` state for use inside the socket callback

  // Start camera
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
      });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (err) =>
      console.error("Socket connect error:", err.message, err)
    );

    // data arrives as raw binary (ArrayBuffer) instead of a base64 string
    socket.on("result", (buffer) => {
      const now = Date.now();
      const delta = now - lastFrameTime.current;
      lastFrameTime.current = now;
      setFps(delta > 0 ? Math.round(1000 / delta) : 0);
      setFrameCount((c) => c + 1);

      const blob = new Blob([buffer], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);

      setOutput((prevUrl) => {
        if (prevUrl) URL.revokeObjectURL(prevUrl); // avoid leaking old blob URLs
        return url;
      });

      sendingRef.current = false; // server is done with the last frame — safe to send the next one
      if (streamingRef.current) sendFrame(); // immediately queue the next frame, no fixed delay
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("result");
      socket.disconnect();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Send a frame as raw binary. Self-chains off the "result" handler above —
  // no fixed interval, so the client never gets ahead of what the server can process.
  const sendFrame = () => {
    if (!streamingRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState !== 4) {
      // camera not ready yet — retry shortly instead of dropping the loop
      setTimeout(sendFrame, 100);
      return;
    }
    if (sendingRef.current) return; // a frame is already in flight, awaiting its result

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = 640;
    canvas.height = 480;
    ctx.drawImage(video, 0, 0, 640, 480);

    sendingRef.current = true;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          sendingRef.current = false;
          return;
        }
        blob.arrayBuffer().then((buffer) => {
          socket.emit("frame", buffer);
          // sendingRef stays true until the "result" event fires — that's what
          // throttles the loop to the server's actual processing speed
        });
      },
      "image/jpeg",
      0.6
    );
  };

  // Kick off / stop the self-chaining send loop when streaming is toggled
  useEffect(() => {
    streamingRef.current = streaming;
    if (streaming) {
      sendingRef.current = false;
      sendFrame();
    }
  }, [streaming]);

  const toggleStreaming = () => {
    setStreaming((prev) => {
      const next = !prev;
      if (!next) {
        setOutput((prevUrl) => {
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          return "";
        });
        setFps(0);
      }
      return next;
    });
  };

  const timeStr = clock.toLocaleTimeString("en-GB", { hour12: false });
  const dateStr = clock.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="brand">
          <span className="brand-mark" />
          <span className="brand-name">Object Detector</span>
        </div>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-label">LINK</span>
            <span className={`stat-value ${connected ? "ok" : "down"}`}>
              <i className="dot" />
              {connected ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">FPS</span>
            <span className="stat-value">{fps.toString().padStart(2, "0")}</span>
          </div>
          <div className="stat">
            <span className="stat-label">FRAMES</span>
            <span className="stat-value">{frameCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{dateStr}</span>
            <span className="stat-value mono-time">{timeStr}</span>
          </div>
        </div>
      </header>

      <main className="dash-main">
        <section className="feed-panel">
          <div className="feed-frame">
            <span className="corner tl" />
            <span className="corner tr" />
            <span className="corner bl" />
            <span className="corner br" />
            {connected && <span className="scan-line" />}

            <video ref={videoRef} autoPlay playsInline muted className="feed-video" />
            {output && <img src={output} alt="tracked output" className="feed-overlay" />}

            {!output && (
              <div className="feed-empty">
                <span>{streaming ? "AWAITING SIGNAL" : "STREAM STOPPED"}</span>
              </div>
            )}
          </div>
          <div className="feed-caption">
            <span>CAM_01 · REAR</span>
            <span>640×480 · JPEG Q60</span>
          </div>
        </section>

        <aside className="side-panel">
          <button
            className={`stream-btn ${streaming ? "is-active" : ""}`}
            onClick={toggleStreaming}
          >
            {streaming ? "■ STOP" : "▶ START"}
          </button>
          <div className="panel-block">
            <h3>SESSION</h3>
            <div className="kv">
              <span>Status</span>
              <span className={connected ? "ok" : "down"}>
                {connected ? "Streaming" : "Disconnected"}
              </span>
            </div>
            <div className="kv">
              <span>Transport</span>
              <span>WebSocket (binary)</span>
            </div>
            <div className="kv">
              <span>Mode</span>
              <span>Adaptive (ack-driven)</span>
            </div>
          </div>

          <div className="panel-block">
            <h3>NOTES</h3>
            <p className="notes">
              Point the rear camera at the scene. Detections render as an
              overlay once the backend returns a processed frame.
            </p>
          </div>
        </aside>
      </main>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}

export default App;