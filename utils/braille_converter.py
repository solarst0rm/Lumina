"""
Markdown到盲文转换核心模块
支持中文现行盲文和英文一级盲文
"""
import re
import jieba
from pypinyin import lazy_pinyin, Style
from .braille_tables import (
    INITIALS_MAP, FINALS_MAP, WHOLE_SYLLABLES,
    PUNCTUATION_CN, PUNCTUATION_EN, DIGITS, DIGIT_PREFIX,
    LETTERS, CAPITAL_PREFIX, BRAILLE_SPACE, BRAILLE_NEWLINE
)


class BrailleConverter:
    """盲文转换器"""
    
    def __init__(self):
        """初始化转换器"""
        # 声母列表（按长度降序排列，优先匹配长声母）
        self.initials = sorted(INITIALS_MAP.keys(), key=len, reverse=True)
    
    def convert_to_braille(self, text: str) -> dict:
        """
        将文本转换为盲文
        
        Args:
            text: 输入文本（可以是Markdown格式）
            
        Returns:
            dict: {
                'unicode': str,      # Unicode盲文字符
                'brf_content': str   # BRF格式内容
            }
        """
        # 1. 预处理Markdown
        processed_text = self._preprocess_markdown(text)
        
        # 2. 逐行转换
        lines = processed_text.split('\n')
        braille_lines = []
        
        for line in lines:
            if not line.strip():
                braille_lines.append('')
                continue
            braille_line = self._convert_line(line)
            braille_lines.append(braille_line)
        
        unicode_braille = '\n'.join(braille_lines)
        
        # 3. 生成BRF格式
        brf_content = self._convert_to_brf(unicode_braille)
        
        return {
            'unicode': unicode_braille,
            'brf_content': brf_content
        }
    
    def _preprocess_markdown(self, text: str) -> str:
        """预处理Markdown文本，移除格式标记但保留结构"""
        # 处理标题（# ## ###）转为标记
        text = re.sub(r'^(#{1,6})\s+(.+)$', 
                      lambda m: '【' + '标题' + '】' + m.group(2), 
                      text, flags=re.MULTILINE)
        
        # 移除加粗标记
        text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
        
        # 移除斜体标记
        text = re.sub(r'\*([^*]+)\*', r'\1', text)
        
        # 移除代码标记
        text = re.sub(r'`([^`]+)`', r'\1', text)
        
        # 移除链接，保留文字
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
        
        # 移除列表标记
        text = re.sub(r'^[\s]*[-*+]\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'^[\s]*\d+\.\s+', '', text, flags=re.MULTILINE)
        
        return text
    
    def _convert_line(self, line: str) -> str:
        """将单行文本转换为盲文"""
        result = []
        segments = self._split_text(line)
        
        for seg_type, content in segments:
            if seg_type == 'chinese':
                result.append(self._convert_chinese(content))
            elif seg_type == 'english':
                result.append(self._convert_english(content))
            elif seg_type == 'digit':
                result.append(self._convert_digits(content))
            elif seg_type == 'punctuation_cn':
                result.append(PUNCTUATION_CN.get(content, BRAILLE_SPACE))
            elif seg_type == 'punctuation_en':
                result.append(PUNCTUATION_EN.get(content, BRAILLE_SPACE))
            elif seg_type == 'space':
                result.append(BRAILLE_SPACE)
            else:
                # 未知字符转为盲文空格，避免输出非盲文字符
                result.append(BRAILLE_SPACE)
        
        return ''.join(result)
    
    def _split_text(self, text: str) -> list:
        """
        分割文本为不同类型的片段
        
        Returns:
            list of (type, content) tuples
        """
        segments = []
        i = 0
        
        while i < len(text):
            char = text[i]
            
            # 空格
            if char in ' \t':
                segments.append(('space', char))
                i += 1
            
            # 中文字符（优先检测，因为isalpha对中文也返回True）
            elif '\u4e00' <= char <= '\u9fff':
                # 收集连续的中文字符
                start = i
                while i < len(text) and '\u4e00' <= text[i] <= '\u9fff':
                    i += 1
                segments.append(('chinese', text[start:i]))
            
            # 英文字母（只收集ASCII字母，避免收集中文）
            elif char.isascii() and char.isalpha():
                start = i
                while i < len(text) and text[i].isascii() and text[i].isalpha():
                    i += 1
                segments.append(('english', text[start:i]))
            
            # 数字
            elif char.isdigit():
                start = i
                while i < len(text) and (text[i].isdigit() or text[i] == '.'):
                    i += 1
                segments.append(('digit', text[start:i]))
            
            # 中文标点
            elif char in PUNCTUATION_CN:
                segments.append(('punctuation_cn', char))
                i += 1
            
            # 英文标点
            elif char in PUNCTUATION_EN:
                segments.append(('punctuation_en', char))
                i += 1
            
            # 其他字符
            else:
                segments.append(('other', char))
                i += 1
        
        return segments
    
    def _convert_chinese(self, text: str) -> str:
        """将中文文本转换为盲文"""
        result = []
        
        # 使用jieba分词
        words = jieba.cut(text)
        
        for word in words:
            # 获取每个字的拼音（带声调数字）
            pinyins = lazy_pinyin(word, style=Style.TONE3)
            
            for pinyin in pinyins:
                braille_char = self._pinyin_to_braille(pinyin)
                result.append(braille_char)
            
            # 词间添加空格
            result.append(BRAILLE_SPACE)
        
        # 移除末尾多余空格
        if result and result[-1] == BRAILLE_SPACE:
            result.pop()
        
        return ''.join(result)
    
    def _normalize_pinyin(self, pinyin: str) -> str:
        """
        规范化拼音：将标准拼写转换为声母+韵母可查表的形式
        pypinyin输出 wen/wan/wang 等，但盲文表用 uen/uan/uang
        """
        # w开头：零声母 + u系韵母
        # w + 韵母 → u + 韵母（去掉w，加u）
        if pinyin.startswith('w'):
            rest = pinyin[1:]
            if rest.startswith('u'):
                # wu → 已在WHOLE_SYLLABLES，不会到这里
                return pinyin
            else:
                return 'u' + rest  # wa→ua, wo→uo, wan→uan, wen→uen, etc.

        # y开头：零声母 + i系或ü系韵母
        if pinyin.startswith('y'):
            rest = pinyin[1:]
            if rest.startswith('i'):
                # yi/yin/ying/yie → 已在WHOLE_SYLLABLES
                return pinyin
            elif rest.startswith('u'):
                # yu/yue/yuan/yun → 已在WHOLE_SYLLABLES
                return pinyin
            else:
                return 'i' + rest  # ya→ia, yao→iao, yan→ian, yang→iang, etc.

        return pinyin

    def _pinyin_to_braille(self, pinyin: str) -> str:
        """将单个拼音转换为盲文"""
        # 移除声调数字，获取纯拼音
        tone_match = re.search(r'(\d)$', pinyin)
        pinyin_no_tone = re.sub(r'\d$', '', pinyin).lower()
        
        # 检查是否为整体认读音节
        if pinyin_no_tone in WHOLE_SYLLABLES:
            return WHOLE_SYLLABLES[pinyin_no_tone]
        
        # 规范化拼音（处理w/y开头的零声母音节）
        pinyin_no_tone = self._normalize_pinyin(pinyin_no_tone)
        
        # 规范化后再检查一次整体认读
        if pinyin_no_tone in WHOLE_SYLLABLES:
            return WHOLE_SYLLABLES[pinyin_no_tone]
        
        # 分离声母和韵母
        initial = ''
        final = pinyin_no_tone
        
        for init in self.initials:
            if pinyin_no_tone.startswith(init):
                initial = init
                final = pinyin_no_tone[len(init):]
                break
        
        # j/q/x + u系韵母 → ü系韵母（pypinyin输出ju/qu/xu，盲文需要用ü系）
        if initial in ('j', 'q', 'x') and final.startswith('u'):
            final = 'v' + final[1:]  # u→v, uan→van, ue→ve, un→vn
        
        # 构建盲文
        braille = ''
        
        # 声母
        if initial and initial in INITIALS_MAP:
            braille += INITIALS_MAP[initial]
        
        # 韵母
        if final and final in FINALS_MAP:
            braille += FINALS_MAP[final]
        elif final:
            # 尝试单字符韵母
            for char in final:
                if char in FINALS_MAP:
                    braille += FINALS_MAP[char]
        
        # 如果转换失败，返回原拼音的字母形式
        if not braille:
            braille = self._convert_english(pinyin_no_tone)
        
        return braille
    
    def _convert_english(self, text: str) -> str:
        """将英文文本转换为盲文"""
        result = []
        
        for char in text:
            lower_char = char.lower()
            
            if lower_char in LETTERS:
                # 大写字母添加前缀
                if char.isupper():
                    result.append(CAPITAL_PREFIX)
                result.append(LETTERS[lower_char])
            else:
                result.append(char)
        
        return ''.join(result)
    
    def _convert_digits(self, text: str) -> str:
        """将数字转换为盲文"""
        result = [DIGIT_PREFIX]  # 数字前缀
        
        for char in text:
            if char in DIGITS:
                result.append(DIGITS[char])
            elif char == '.':
                result.append(PUNCTUATION_EN.get('.', '.'))
            else:
                result.append(char)
        
        return ''.join(result)
    
    def _convert_to_brf(self, unicode_braille: str) -> str:
        """
        将Unicode盲文转换为BRF格式
        BRF使用ASCII字符表示盲文点阵
        """
        brf_lines = []
        
        for line in unicode_braille.split('\n'):
            brf_line = []
            for char in line:
                if '\u2800' <= char <= '\u28ff':
                    # Unicode盲文字符范围: U+2800 - U+28FF
                    # BRF映射: 点阵值 + 0x20 (空格的ASCII码)
                    dots = ord(char) - 0x2800
                    brf_char = chr(dots + 0x20)
                    brf_line.append(brf_char)
                else:
                    brf_line.append(char)
            brf_lines.append(''.join(brf_line))
        
        return '\n'.join(brf_lines)


def generate_brf_file(brf_content: str, output_path: str, 
                      page_width: int = 40, page_height: int = 25) -> str:
    """
    生成BRF文件
    
    Args:
        brf_content: BRF格式内容
        output_path: 输出文件路径
        page_width: 每行字符数（默认40）
        page_height: 每页行数（默认25）
        
    Returns:
        str: 生成的文件路径
    """
    lines = brf_content.split('\n')
    pages = []
    current_page = []
    
    for line in lines:
        # 行宽自动换行
        wrapped_lines = _wrap_line(line, page_width)
        
        for wrapped_line in wrapped_lines:
            if len(current_page) >= page_height:
                pages.append('\n'.join(current_page))
                current_page = []
            current_page.append(wrapped_line)
    
    if current_page:
        pages.append('\n'.join(current_page))
    
    # 写入文件
    with open(output_path, 'w', encoding='ascii', errors='replace') as f:
        for i, page in enumerate(pages):
            f.write(page)
            if i < len(pages) - 1:
                f.write('\f')  # 分页符
    
    return output_path


def _wrap_line(line: str, width: int) -> list:
    """行宽自动换行"""
    if len(line) <= width:
        return [line]
    
    wrapped = []
    while line:
        wrapped.append(line[:width])
        line = line[width:]
    return wrapped
