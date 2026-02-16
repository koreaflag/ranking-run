FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PostGIS client libs
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        python3-dev \
        libpq-dev \
        libgeos-dev \
        libproj-dev \
        gdal-bin \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency file
COPY requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
