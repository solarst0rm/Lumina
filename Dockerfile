FROM modelscope-registry.cn-beijing.cr.aliyuncs.com/modelscope-repo/python:3.10

WORKDIR /home/user/app

COPY ./ /home/user/app

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

RUN python -m pip install --no-cache-dir --retries 10 --timeout 120 \
    -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/

EXPOSE 7860

ENTRYPOINT ["python", "-u", "app.py"]
