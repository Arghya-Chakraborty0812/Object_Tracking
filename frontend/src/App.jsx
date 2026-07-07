import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css";

// ⚠️ change this to your backend IP
const socket = io("http://192.168.29.193:5002", {
  transports: ["websocket"],
});

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [output, setOutput] = useState("");
  const [connected, setConnected] = useState(false);

  // Start camera
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "environment" }, // rear camera
      })
      .then((stream) => {
        videoRef.current.srcObject = stream;
      });

    socket.on("connect", () => {
      setConnected(true);
    });
    socket.on("connect_error", (err) => console.error("Socket connect error:", err.message, err));

    socket.on("result", (data) => {
      setOutput(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Send frames
  const sendFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState !== 4) return;
  
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
  
    canvas.width = 640;
    canvas.height = 480;
  
    ctx.drawImage(video, 0, 0, 640, 480);
  
    const data = canvas.toDataURL("image/jpeg", 0.6);
  
    socket.emit("frame", data);
  };

  // Loop
  useEffect(() => {
    const interval = setInterval(sendFrame, 150); // adjust FPS
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <h2>🚗 YOLO Object Tracking</h2>

      <div className="status">
        Status: {connected ? "🟢 Connected" : "🔴 Connecting..."}
      </div>

      <div className="video-container">
        <video ref={videoRef} autoPlay playsInline />
        { output &&(
           <img src={output} alt="output" className="overlay" />
        )}
       
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <p className="hint">Point your camera at objects 🚦</p>
    </div>
  );
}

export default App;