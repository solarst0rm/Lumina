FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10

WORKDIR /home/user/app

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt /home/user/app/requirements.txt
RUN python -m pip install --no-cache-dir --retries 10 --timeout 120 \
    -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/

COPY ./ /home/user/app

RUN mkdir -p /home/user/app/data/uploads

ENV HOST=0.0.0.0 \
    PORT=7860 \
    DATA_DIR=/home/user/app/data \
    UPLOAD_FOLDER=/home/user/app/data/uploads \
    WEB_CONCURRENCY=1 \
    WEB_THREADS=1 \
    WEB_TIMEOUT=300

EXPOSE 7860

VOLUME ["/home/user/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT', '7860'), timeout=3).read()"

CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:app"]
