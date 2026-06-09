"""
下载 Whisper 模型
"""
import whisper
import os

print("正在下载 Whisper small 模型...")
print("这可能需要几分钟时间，请耐心等待...")

model = whisper.load_model("small")

print("\n模型下载完成！")
print(f"模型路径: {os.path.expanduser('~/.cache/whisper/small.pt')}")

# 创建 models 目录并复制模型
import shutil
os.makedirs("models", exist_ok=True)
shutil.copy(
    os.path.expanduser("~/.cache/whisper/small.pt"),
    "models/small.pt"
)
print("模型已复制到项目目录: models/small.pt")
