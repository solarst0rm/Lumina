# Docker 部署说明

本项目现在可以作为 Docker 服务运行，对外暴露 Web 页面和 Flask API。

## 启动

1. 准备环境变量：

```bash
cp .env.example .env
```

编辑 `.env`，至少设置：

```env
SECRET_KEY=replace-with-a-random-secret
xxx_KEY=your-api-key-here
```

也可以使用 `API_KEY` 代替 `xxx_KEY`。模型服务默认使用：

```env
BASE_URL=https://api-inference.modelscope.cn/v1
MODEL_NAME=Qwen/Qwen3-VL-8B-Instruct
```

2. 构建并启动：

```bash
docker compose up --build
```

3. 访问服务：

```text
http://localhost:7860
```

健康检查接口：

```bash
curl http://localhost:7860/api/health
```

## 数据持久化

Compose 默认使用命名卷 `lumina_data`，挂载到容器内：

```text
/home/user/app/data
```

以下文件会保存在这个目录中：

- `notes.db`
- `uploads/`
- `jobs/`
- `summary.md`
- `exercise.md`
- `exercise.json`
- 导出的 `.brf` 文件

## API 调用

当前业务 API 沿用网页登录体系，因此 `/api/process`、`/api/convert_braille`、`/api/ai-chat` 等接口需要登录后的 session cookie。

注册账号：

```bash
curl -c cookies.txt \
  -d "username=testuser" \
  -d "password=testpass123" \
  -d "confirm_password=testpass123" \
  http://localhost:7860/register
```

登录：

```bash
curl -c cookies.txt \
  -d "username=testuser" \
  -d "password=testpass123" \
  http://localhost:7860/login
```

上传并处理文档：

```bash
curl -b cookies.txt \
  -F "file=@example.pdf" \
  -F "prompt=请生成适合读屏的课程总结" \
  http://localhost:7860/api/process
```

盲文转换：

```bash
curl -b cookies.txt \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"你好，Lumina\"}" \
  http://localhost:7860/api/convert_braille
```

## 不使用 Compose

也可以直接运行镜像：

```bash
docker build -t lumina-lingsight .
docker run --rm -p 7860:7860 \
  -e SECRET_KEY=replace-with-a-random-secret \
  -e xxx_KEY=your-api-key-here \
  -v lumina_data:/home/user/app/data \
  lumina-lingsight
```

