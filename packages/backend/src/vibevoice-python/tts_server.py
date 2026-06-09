from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
import asyncio
import edge_tts

app = FastAPI()

print("[START] 正在启动 Edge TTS 服务...")
print("[INFO] 使用微软 Edge 浏览器 TTS 引擎，无需下载模型")

class TTSRequest(BaseModel):
    text: str

@app.post("/generate_audio")
async def generate_audio(request: TTSRequest):
    print(f"[TTS] 收到文本: {request.text}")
    
    try:
        # 使用 Edge TTS 生成音频
        communicate = edge_tts.Communicate(
            request.text, 
            voice="zh-CN-XiaoxiaoNeural",  # 中文女声
            rate="+0%",  # 语速
            volume="+0%"  # 音量
        )
        
        # 收集音频数据
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
        
        if not audio_chunks:
            print("[ERROR] 没有收到音频数据")
            return Response(content=b"", media_type="audio/mp3")
        
        # 合并音频数据
        audio_bytes = b"".join(audio_chunks)
        print(f"[OK] 音频生成成功！大小: {len(audio_bytes)} bytes")
        
        return Response(
            content=audio_bytes,
            media_type="audio/mp3",
            headers={
                "Content-Disposition": "attachment; filename=tts_output.mp3",
                "Content-Length": str(len(audio_bytes))
            }
        )
        
    except Exception as e:
        print(f"[ERROR] 音频生成失败: {e}")
        import traceback
        traceback.print_exc()
        return Response(content=b"", media_type="audio/mp3")

@app.get("/")
async def root():
    return {
        "message": "Edge TTS 服务",
        "status": "running",
        "endpoints": {
            "POST /generate_audio": "生成语音"
        }
    }

if __name__ == "__main__":
    import uvicorn
    print("[START] 启动 Edge TTS 服务...")
    print("[INFO] 服务地址: http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
