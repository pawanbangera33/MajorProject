FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt gunicorn

COPY . .

EXPOSE 7860

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--threads", "1", "--timeout", "120", "app:app"]
