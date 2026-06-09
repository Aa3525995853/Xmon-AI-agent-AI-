#!/usr/bin/env python3
"""
Whisper ASR 守护进程
使用 faster-whisper 本地模型，完全离线运行
"""

import sys
import json
import os
import time
import warnings
warnings.filterwarnings('ignore')

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

def log(msg):
    print(f"[ASR] {msg}", flush=True)

def main():
    try:
        from faster_whisper import WhisperModel
        
        # 检测 GPU 可用性
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        
        log(f"使用设备: {device}")
        log("正在加载 Whisper 模型 (base)...")

        # 加载模型 - 使用 base 模型平衡速度和准确度
        # local_files_only=False 允许从 Hugging Face 自动下载模型
        model = WhisperModel("base", device=device, compute_type=compute_type, local_files_only=False)
        
        log("Whisper 模型加载完成")
        log("服务就绪")
        
        # 主循环 - 从 stdin 读取请求
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            
            try:
                request = json.loads(line)
                audio_path = request.get('path')
                request_id = request.get('_requestId', 0)
                
                if not audio_path or not os.path.exists(audio_path):
                    result = {
                        "success": False,
                        "error": "音频文件不存在",
                        "_requestId": request_id
                    }
                    print(json.dumps(result), flush=True)
                    continue
                
                # 识别
                start_time = time.time()
                segments, info = model.transcribe(audio_path, language="zh", beam_size=5)
                text = "".join([segment.text for segment in segments]).strip()
                elapsed_ms = int((time.time() - start_time) * 1000)
                
                result = {
                    "success": True,
                    "text": text,
                    "elapsed_ms": elapsed_ms,
                    "_requestId": request_id
                }
                print(json.dumps(result), flush=True)
                
            except Exception as e:
                result = {
                    "success": False,
                    "error": str(e),
                    "_requestId": request.get('_requestId', 0) if 'request' in dir() else 0
                }
                print(json.dumps(result), flush=True)
                
    except ImportError as e:
        log(f"导入错误: {e}")
        log("请安装依赖: pip install faster-whisper torch")
        sys.exit(1)
    except Exception as e:
        log(f"启动失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
