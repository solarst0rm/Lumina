"""文档处理核心模块：文件解析、模型调用、结果生成"""
import os
import re
import base64  # 务必保留这个导入！
from pathlib import Path
from openai import OpenAI
from PIL import Image, ImageDraw  # 补充ImageDraw导入（PPT转图片需要）
import fitz  # PyMuPDF
from pptx import Presentation
from docx import Document
# 导入渲染工具
from utils.render_utils import render_markdown_to_html
# ========== 直接导入练习题生成逻辑 ==========
from utils.exercise_generator import generate_valid_exercises
from core.config import (
    API_KEY, BASE_URL, MODEL_NAME, DEFAULT_SUMMARY_FILENAME,
    DEFAULT_EXERCISE_FILENAME, FINAL_PROMPT_TEMPLATE, MAX_IMAGE_SIDE,
    DEFAULT_USER_PROMPT
)

# 初始化OpenAI客户端
client = OpenAI(base_url=BASE_URL, api_key=API_KEY)

def resize_image(path):
    """调整图片尺寸，确保最大边长不超过限制"""
    img = Image.open(path)
    w, h = img.size
    scale = MAX_IMAGE_SIDE / max(w, h)
    if scale < 1:
        img = img.resize((int(w * scale), int(h * scale)))
        img.save(path)

def image_to_base64(path):
    """将图片转换为base64编码（用于模型输入）"""
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def clean_plain_text(text):
    """清理Markdown异常字符，确保渲染正常"""
    text = re.sub(r"[\\>`|]", "", text)  # 移除危险字符
    text = re.sub(r"\n{3,}", "\n\n", text)  # 合并多余空行
    return text.strip()

def save_markdown(content, filename):
    """保存内容到Markdown文件"""
    with open(filename, "w", encoding="utf-8") as f:
        f.write(content)

def file_to_images(filepath):
    """将PDF/PPT/图片文件转换为图片列表（返回图片路径和临时文件列表）"""
    image_paths = []
    temp_images = []
    filepath_lower = filepath.lower()

    try:
        if filepath_lower.endswith((".jpg", ".jpeg", ".png")):
            # 图片文件直接添加
            resize_image(filepath)
            image_paths.append(filepath)
        elif filepath_lower.endswith(".pdf"):
            # PDF转图片（使用PyMuPDF）
            doc = fitz.open(filepath)
            for i in range(len(doc)):
                page = doc[i]
                mat = fitz.Matrix(2.0, 2.0)  # 提高分辨率
                pix = page.get_pixmap(matrix=mat)
                img_path = f"_page_{i}.jpg"
                pix.save(img_path)
                resize_image(img_path)
                image_paths.append(img_path)
                temp_images.append(img_path)
            doc.close()
        elif filepath_lower.endswith(".pptx"):
            # PPT转图片
            prs = Presentation(filepath)
            slide_size = (960, 720)  # 标准PPT尺寸
            for i, slide in enumerate(prs.slides):
                img = Image.new("RGB", slide_size, "white")
                draw = ImageDraw.Draw(img)
                # 添加幻灯片编号
                draw.text((10, 10), f"Slide {i+1}", fill="black")
                # 提取幻灯片文本
                y_offset = 50
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text:
                        draw.text((20, y_offset), shape.text[:50], fill="black")
                        y_offset += 30
                img_path = f"_slide_{i}.jpg"
                img.save(img_path)
                resize_image(img_path)
                image_paths.append(img_path)
                temp_images.append(img_path)
        elif filepath_lower.endswith((".doc", ".docx")):
            # Word文档：提取文本，渲染为图片供模型识别
            doc_obj = Document(filepath)
            all_text = []
            for para in doc_obj.paragraphs:
                if para.text.strip():
                    all_text.append(para.text.strip())
            # 同时提取表格内容
            for table in doc_obj.tables:
                for row in table.rows:
                    row_text = ' | '.join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_text:
                        all_text.append(row_text)
            
            lines_per_page = 30
            for page_idx in range(0, max(1, len(all_text)), lines_per_page):
                page_lines = all_text[page_idx:page_idx + lines_per_page]
                img = Image.new("RGB", (960, 720), "white")
                draw = ImageDraw.Draw(img)
                y_offset = 20
                for line in page_lines:
                    draw.text((20, y_offset), line[:80], fill="black")
                    y_offset += 22
                img_path = f"_docx_{page_idx}.jpg"
                img.save(img_path)
                resize_image(img_path)
                image_paths.append(img_path)
                temp_images.append(img_path)
        else:
            raise ValueError("不支持的文件格式")
    except Exception as e:
        # 清理临时文件
        for path in temp_images:
            if os.path.exists(path):
                os.remove(path)
        raise e

    return image_paths, temp_images

def call_model(image_paths, user_prompt):
    """调用AI模型生成总结"""
    # 构造提示词
    final_prompt = FINAL_PROMPT_TEMPLATE.format(user_prompt=user_prompt)
    # 构造多模态输入
    content = [{"type": "text", "text": final_prompt}]
    for path in image_paths:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_to_base64(path)}"}
        })
    # 调用模型
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": "user", "content": content}]
    )
    return response.choices[0].message.content

def process_uploaded_file(filepath, user_prompt):
    """处理上传文件的完整流程：转图片→调用模型→生成总结→生成练习题→自动渲染预览"""
    temp_images = []
    try:
        # 1. 文件转图片
        image_paths, temp_images = file_to_images(filepath)
        
        # 2. 调用模型生成总结
        user_prompt = user_prompt or DEFAULT_USER_PROMPT
        model_result = call_model(image_paths, user_prompt)
        cleaned_result = clean_plain_text(model_result)
        markdown_content = cleaned_result.strip()
        
        # 3. 保存总结文件
        summary_path = Path(DEFAULT_SUMMARY_FILENAME)
        save_markdown(markdown_content, summary_path)
        
        # 4. 自动渲染总结预览
        print(f"正在渲染总结预览页面...")
        render_markdown_to_html(summary_path, is_exercise=False)
        
        # ========== 生成结构化练习题和 Markdown 题单 ==========
        print(f"正在生成适配盲生的练习题...")
        _, exercise_content = generate_valid_exercises(summary_path)
        
        return {
            'success': True,
            'message': '文件处理成功（总结+练习题已生成）',
            'summary': markdown_content,
            'summary_path': str(summary_path.absolute()),
            'exercise_path': str(Path(DEFAULT_EXERCISE_FILENAME).absolute()),
            'exercise': exercise_content,
        }
    except TimeoutError:
        return {'success': False, 'error': '处理超时，文件可能过大或过复杂'}
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        # 清理临时图片
        for path in temp_images:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as e:
                    print(f"清理临时文件失败：{path} - {e}")
