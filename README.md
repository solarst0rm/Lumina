# Lumina（聆光一闪）

面向视障学生的 AI 无障碍学习助手。

聆光一闪 以“Accessibility First（无障碍优先）”为核心设计理念，提供文档智能总结、语音交互、练习题生成、盲文转换等功能，帮助视障用户更高效地获取、整理与学习课程内容。

本项目在 AI 辅助下完成，并由开发团队进行功能整理、调试与维护。

---

## 项目经历

- AI Hackathon Tour 2026 高校联赛「最具市场潜力奖」
- 项目相关成果曾被复旦大学相关平台及《商学院》杂志报道

---

## 项目背景

当前视障学生在学习中仍面临许多现实问题：

- 教辅资料多为视觉化格式，缺乏结构化适配
- 传统读屏软件检索效率较低
- 现有学习工具缺少面向“听觉认知”的设计
- 练习题与知识梳理对视障用户不够友好

为了解真实需求，我们与上海市盲童学校教师及视障学生进行了访谈调研，并基于实际学习场景设计了本项目。

---

## 功能特性

### 文档智能处理
- 支持上传 PDF / PPTX / DOCX / 图片
- 自动生成适合语音朗读的课程总结
- 自动生成结构化练习题

### 无障碍交互
- 全键盘操作支持
- Web Speech API 语音朗读（TTS）
- 可调节语速与断点续读
- 适配读屏软件与低视力场景
- 新手语音教程与快捷键帮助系统

### AI 学习助手
- 支持语音输入与语音回复
- 可结合当前文档内容进行问答
- 基于 OpenAI Compatible API 调用多模态模型

### 盲文支持
- 支持 Unicode 盲文输出
- 支持 BRF 文件导出
- 中文拼音盲文映射

### 学习社区
- 本地学习社区系统
- 支持总结分享、搜索与本地备份同步

---

## 技术栈

### 后端
- Python 3.x
- Flask
- Flask-SQLAlchemy
- Flask-Login
- SQLite

### AI 与模型
- OpenAI Compatible SDK
- ModelScope Inference API
- Qwen/Qwen3-VL-8B-Instruct

### 文档处理
- PyMuPDF
- python-pptx
- python-docx
- Pillow

### 前端
- Jinja2 模板
- 原生 JavaScript
- Web Speech API

### 无障碍相关
- WAI-ARIA
- WCAG 2.1 导向设计

---

## 项目结构

```text
Lumina/
├── flask_app.py          # Flask 入口
├── routes.py             # 页面与 API 路由
├── core/                 # 核心处理逻辑
├── utils/                # 工具模块
├── templates/            # 前端页面模板
├── static/               # 静态资源（JS / CSS / 音频）
├── uploads/              # 上传文件目录
├── docs/                 # 项目文档
└── requirements.txt
```

---

##  快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/solarst0rm/Lumina.git
cd Lumina
```

### 2. 创建虚拟环境

```bash
python -m venv .venv
```

### 3. 激活虚拟环境

Windows PowerShell：

```powershell
.\.venv\Scripts\Activate.ps1
```

若提示脚本被禁用：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### 4. 安装依赖

```bash
pip install -r requirements.txt
```

### 5. 配置环境变量

创建 `.env` 文件：

```env
API_KEY=your_api_key
SECRET_KEY=your_secret_key
```

### 6. 启动项目

```bash
python flask_app.py
```

默认访问地址：

```text
http://127.0.0.1:5000
```

---

## 无障碍设计

Lumina 将“无障碍”作为核心功能，而非附加功能。

目前支持：

- 全键盘交互
- 读屏友好布局
- 语音反馈
- 语音控制
- 盲文导出
- 低视力引导系统
- 快捷键帮助系统

常用快捷键：

| 按键 | 功能 |
|---|---|
| S | 朗读总结 |
| E | 朗读练习题 |
| Space | 暂停 / 继续 |
| X | 停止朗读 |
| ← / → | 上一段 / 下一段 |
| ↑ / ↓ | 调整语速 |
| H | 打开帮助 |

---

## 开发文档

更详细的技术实现、系统流程与 API 说明请见：

```text
docs/
├── architecture.md
├── accessibility.md
├── deployment.md
└── api.md
```

（待维护）

---

## 当前状态

本项目目前仍处于持续开发阶段。

本项目由团队协作完成。由于项目早期主要采用本地协作与统一上传方式进行开发，部分历史 commit 未能准确反映所有成员的实际参与情况。后续开发已逐步迁移至 GitHub 协作流程。

这是一个由本科生团队共同维护的开源项目，欢迎交流、反馈与贡献建议。

---

## 📄 License

MIT License
