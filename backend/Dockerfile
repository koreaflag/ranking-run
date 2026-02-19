FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for PostGIS, Pillow, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libgeos-dev libproj-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create upload directories
RUN mkdir -p uploads/avatars

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
