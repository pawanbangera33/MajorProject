import os
import time
import torch
import torch.nn as nn
import numpy as np
import cv2
import base64
from io import BytesIO
from torchvision import transforms, models
from PIL import Image
from flask import Flask, render_template, request, jsonify, send_from_directory

app = Flask(__name__)

# -----------------------------
# Setup Device and Model
# -----------------------------
device = "cuda" if torch.cuda.is_available() else "cpu"
model_path = "smear_quality_model.pth"

# Initialize model architecture
model = models.efficientnet_b0(weights=None)
model.classifier[1] = nn.Linear(model.classifier[1].in_features, 2)

# Load weights
model_loaded = False
model_info = {"error": None, "device": device}

try:
    if os.path.exists(model_path):
        model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
        model = model.to(device)
        model.eval()
        model_loaded = True
        model_info["status"] = "loaded"
        print("Model loaded successfully on", device)
    else:
        model_info["status"] = "missing"
        model_info["error"] = f"Model file {model_path} not found"
        print(f"WARNING: Model file {model_path} not found!")
except Exception as e:
    model_info["status"] = "error"
    model_info["error"] = str(e)
    print(f"ERROR loading model: {e}")

# -----------------------------
# Transform (must match training)
# -----------------------------
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
])

# -----------------------------
# Grad-CAM Implementation
# -----------------------------
class GradCAM:
    def __init__(self, model, target_layer):
        self.model = model
        self.target_layer = target_layer
        self.gradients = None
        self.activations = None

        self.target_layer.register_forward_hook(self.save_activation)
        self.target_layer.register_full_backward_hook(self.save_gradient)

    def save_activation(self, module, input, output):
        self.activations = output

    def save_gradient(self, module, grad_input, grad_output):
        self.gradients = grad_output[0]

    def generate(self, input_tensor, class_idx=None):
        output = self.model(input_tensor)

        if class_idx is None:
            class_idx = torch.argmax(output)

        self.model.zero_grad()
        output[0, class_idx].backward()

        gradients = self.gradients[0].detach().cpu().numpy()
        activations = self.activations[0].detach().cpu().numpy()

        weights = np.mean(gradients, axis=(1, 2))
        cam = np.zeros(activations.shape[1:], dtype=np.float32)

        for i, w in enumerate(weights):
            cam += w * activations[i]

        cam = np.maximum(cam, 0)
        cam = cv2.resize(cam, (224, 224))
        cam_min, cam_max = cam.min(), cam.max()

        if cam_max - cam_min > 1e-6:
            cam = (cam - cam_min) / (cam_max - cam_min)
        else:
            cam = np.zeros_like(cam)

        return cam

if model_loaded:
    target_layer = model.features[-1]
    grad_cam = GradCAM(model, target_layer)
else:
    grad_cam = None

def predict_with_gradcam(img, conf_threshold=0.6):
    if not model_loaded:
        raise RuntimeError("Model not loaded. Cannot perform prediction.")

    img = img.convert("RGB")
    img_resized = img.resize((224, 224))

    input_tensor = transform(img).unsqueeze(0).to(device)

    # Prediction
    with torch.no_grad():
        output = model(input_tensor)
        probs = torch.softmax(output, dim=1)

    pred = torch.argmax(probs, dim=1).item()
    confidence = probs[0][pred].item()

    if confidence < conf_threshold:
        label = "Uncertain"
    else:
        label = "Good Smear" if pred == 1 else "Bad Smear"

    # Grad-CAM
    input_tensor.requires_grad_(True)
    cam = grad_cam.generate(input_tensor, pred)

    # Convert to overlay
    img_np = np.array(img_resized)
    heatmap = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)
    overlay = cv2.addWeighted(img_np, 0.6, heatmap, 0.4, 0)

    overlay_pil = Image.fromarray(cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB))

    def pil_to_b64(image):
        buffered = BytesIO()
        image.save(buffered, format="JPEG", quality=92)
        return base64.b64encode(buffered.getvalue()).decode('utf-8')

    original_b64 = pil_to_b64(img_resized)
    overlay_b64 = pil_to_b64(overlay_pil)

    return {
        "label": label,
        "confidence": confidence,
        "original_image": original_b64,
        "gradcam_image": overlay_b64
    }

# -----------------------------
# Routes
# -----------------------------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if not model_loaded:
        return jsonify({"error": "Model is not loaded. Please check server logs."}), 503

    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    try:
        img = Image.open(file.stream)
        result = predict_with_gradcam(img)
        return jsonify(result)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        app.logger.error(f"Prediction error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/sample/<filename>')
def serve_sample(filename):
    safe_name = os.path.basename(filename)
    file_path = os.path.join('.', safe_name)

    if not os.path.exists(file_path):
        return jsonify({"error": "Sample not found"}), 404

    return send_from_directory('.', safe_name)

@app.route('/info')
def model_info_endpoint():
    return jsonify({
        "model": "EfficientNet-B0",
        "num_classes": 2,
        "device": model_info.get("device"),
        "status": model_info.get("status"),
        "classes": ["Bad Smear", "Good Smear"],
        "input_size": [224, 224],
        "architecture": "Transfer Learning (ImageNet backbone, frozen features)"
    })

@app.route('/health')
def health():
    return jsonify({
        "status": "healthy",
        "model_loaded": model_loaded,
        "timestamp": time.time()
    })

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404

@app.errorhandler(500)
def server_error(e):
    app.logger.error(f"Server error: {e}")
    return jsonify({"error": "Internal server error"}), 500

# -----------------------------
# Startup
# -----------------------------
if __name__ == '__main__':
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static', exist_ok=True)
    port = int(os.environ.get("PORT", "7860"))
    app.run(host='0.0.0.0', port=port, debug=False)
