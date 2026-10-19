# Image dùng chung cho api, worker và migrate (deploy/docker-compose.yml). Build từ thư mục server/.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 TZ=Asia/Ho_Chi_Minh
WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
COPY db ./db
COPY scripts ./scripts
COPY data ./data

RUN useradd --system --uid 10001 medassist
USER medassist

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
