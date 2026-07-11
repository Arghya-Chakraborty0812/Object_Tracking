from flask import Flask
from flask_socketio import SocketIO, emit
import cv2
import numpy as np
import torch
from ultralytics import YOLO

app = Flask(__name__)
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    max_http_buffer_size=10_000_000,  # allow larger binary frames if needed
)

# Load your trained model — force GPU if available, since CPU inference
# is almost always the actual bottleneck causing "lag" in real-time streams
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🖥️ Running inference on: {device}")

model = YOLO("best-2.pt")
model.to(device)


@socketio.on('frame')
def handle_frame(data):
    try:
        # data arrives as raw bytes (ArrayBuffer sent from the client) —
        # no base64 decoding needed anymore
        np_arr = np.frombuffer(data, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return

        # Run tracking
        results = model.track(
            frame,
            tracker="bytetrack.yaml",
            persist=True,
            conf=0.4,
            device=device,
            verbose=False,  # skip Ultralytics' own per-frame console logging, it's not free
        )

        r = results[0]

        # Draw boxes
        annotated = r.plot()

        # Encode as JPEG and send raw bytes — no base64 involved
        success, buffer = cv2.imencode('.jpg', annotated)
        if not success:
            print("❌ JPEG encode failed")
            return

        emit('result', buffer.tobytes())

    except Exception as e:
        print("🔥 Error:", e)


if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5002)