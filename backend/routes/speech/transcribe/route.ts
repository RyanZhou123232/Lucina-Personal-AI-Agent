import { NextResponse } from 'next/server';
import { apiError, getAuthenticatedUser } from '@/lib/http';
import { speechConfig, transcribeAudio, audioMime, SpeechError, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from '@/lib/stt';
const active = new Set<string>();
export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return apiError('请先登录。', 401);
  try { speechConfig(); return NextResponse.json({configured:true,maxSeconds:MAX_AUDIO_SECONDS}, {headers:{'Cache-Control':'no-store'}}); }
  catch (error) { return NextResponse.json({configured:false,message:error instanceof SpeechError ? error.message : '语音服务配置不可用。'}, {headers:{'Cache-Control':'no-store'}}); }
}
export async function POST(request: Request) {
  let owner: string | undefined;
  try {
    // Same-origin check prevents another website from spending an authenticated user's quota.
    if (request.headers.get('origin') !== new URL(request.url).origin) return apiError('请求来源不匹配，请从应用内录音。',403);
    const { user } = await getAuthenticatedUser();
    if (!user) return apiError('请先登录后转写。',401);
    if (active.has(user.id)) return apiError('上一段录音仍在转写，请稍等。',429);
    owner=user.id; active.add(owner);
    speechConfig();
    const mime=audioMime(request.headers.get('content-type'));
    const duration=Number(request.headers.get('x-audio-seconds'));
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_AUDIO_SECONDS) throw new SpeechError('每段录音请控制在 5 分钟以内。');
    const declared=Number(request.headers.get('content-length'));
    if (declared > MAX_AUDIO_BYTES) throw new SpeechError('录音文件过大，请分段录制。',413);
    if (!request.body) throw new SpeechError('请先录制一段语音。');
    const reader=request.body.getReader(); const parts: Uint8Array[]=[]; let bytes=0;
    try {
      for (;;) {
        const chunk=await reader.read(); if (chunk.done) break;
        bytes+=chunk.value.length;
        if (bytes>MAX_AUDIO_BYTES) { await reader.cancel(); throw new SpeechError('录音文件过大，请分段录制。',413); }
        parts.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const result=await transcribeAudio(Buffer.concat(parts),mime,request.signal);
    // No messages, personal records or audio files are persisted by this endpoint.
    return NextResponse.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch (error) { return apiError(error instanceof SpeechError ? error.message : '转写暂时不可用，请稍后重试。', error instanceof SpeechError ? error.status : 503); }
  finally { if (owner) active.delete(owner); }
}
