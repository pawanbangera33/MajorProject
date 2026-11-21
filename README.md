---
title: SmearLab
sdk: docker
app_port: 7860
pinned: false
---

# SmearLab

SmearLab is a Flask app that classifies blood-smear image quality with an
EfficientNet-B0 model and displays a Grad-CAM visualization.

## Run locally

Place `smear_quality_model.pth` in the project root, then install the
dependencies and start the app:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Open `http://localhost:7860`. The sample gallery also needs `Image01.jpg`,
`Image02.jpg`, and `Image03.jpg` in the project root.

## Deploy to Hugging Face Spaces

This repository includes a Dockerfile and Space metadata for port 7860. Create
a public Space with the Docker SDK, then push this repository to the Space:

```bash
git clone https://github.com/pawanbangera33/MajorProject.git
cd MajorProject
git remote add space https://huggingface.co/spaces/<your-username>/<your-space-name>
git push space main
```

Authenticate Git with Hugging Face when prompted. Keep the model file in the
repository root; it is required at startup. The model and app produce
experimental quality assessments and are not for clinical diagnosis.

## Repository contents

The training datasets, local virtual environment, and generated archives are
not needed to run the web app and should not be committed. The source scripts
for training and evaluation can be included without the datasets.
