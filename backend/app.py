from flask import Flask
from flask_socketio import SocketIO, emit
import base64
import cv2
import numpy as np
from ultralytics import YOLO

app = Flask(__name__)
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading"
)

# Load your trained model
model = YOLO("best-2.pt")


@socketio.on('frame')
def handle_frame(data):
    try:
        print("\n📩 Frame received")

        # Decode base64 image
        img_data = base64.b64decode(data.split(',')[1])
        np_arr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            print("❌ Frame decode failed")
            return

        print(f"✅ Frame shape: {frame.shape}")

        # Run tracking
        results = model.track(
            frame,
            tracker="botsort.yaml",
            persist=True,
            conf=0.4
        )

        r = results[0]

        # 🔍 DEBUG DETECTIONS
        if r.boxes is None:
            print("❌ No detections")
        else:
            print(f"✅ Detections found: {len(r.boxes)}")

            # Confidence scores
            print("📊 Conf:", r.boxes.conf.cpu().numpy())

            # Classes
            print("🏷 Classes:", r.boxes.cls.cpu().numpy())

            # Tracking IDs
            if r.boxes.id is not None:
                print("🆔 IDs:", r.boxes.id.cpu().numpy())
            else:
                print("⚠️ No tracking IDs (tracker not active)")

        # Draw boxes
        annotated = r.plot()

        # Encode back
        _, buffer = cv2.imencode('.jpg', annotated)
        encoded = base64.b64encode(buffer).decode('utf-8')

        emit('result', f"data:image/jpeg;base64,{encoded}")

    except Exception as e:
        print("🔥 Error:", e)
if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5002)