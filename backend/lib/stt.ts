export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 300;
export class SpeechError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function speechConfig() {
  const key = process.env.STT_API_KEY;
  if (!key?.trim()) throw new SpeechError('请先配置语音服务密钥。', 503);
  const base = process.env.STT_BASE_URL?.replace(/\/+$/, '');
  if (!base) throw new SpeechError('请配置语音服务接入地址（STT_BASE_URL）。', 503);
  let url: URL;
  try { url = new URL(base); } catch { throw new SpeechError('语音服务接入地址格式不正确。', 503); }
  // Never send a server key to arbitrary configurable hosts or follow redirects.
  if (url.protocol !== 'https:' || !/^[a-zA-Z0-9-]+\.(us-east-1|cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/.test(url.hostname) || url.pathname !== '/api/v1' || url.username || url.password || url.port || url.search || url.hash) {
    throw new SpeechError('请使用百炼业务空间的原生 API 地址，末尾为 /api/v1。', 503);
  }
  const model = process.env.STT_MODEL || 'qwen3-asr-flash';
  if (!/^qwen3-asr-flash(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) throw new SpeechError('请使用 qwen3-asr-flash 录音转写模型。', 503);
  return { key, endpoint: base + '/services/aigc/multimodal-generation/generation', model };
}
export function audioMime(value: string | null) {
  const mime = (value || '').split(';')[0].trim().toLowerCase();
  if (!['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg'].includes(mime)) throw new SpeechError('不支持这段录音的格式，请使用 Chrome 或 Edge 重新录制。', 415);
  return mime;
}
export function validateAudio(audio: Buffer, mime: string) {
  if (audio.length < 16) throw new SpeechError('录音为空或太短，请重新录制。');
  if (audio.length > MAX_AUDIO_BYTES) throw new SpeechError('录音文件过大，请分成较短的录音。', 413);
  const signature = mime === 'audio/webm' ? audio.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))
    : mime === 'audio/ogg' ? audio.subarray(0,4).toString() === 'OggS'
    : mime === 'audio/wav' ? audio.subarray(0,4).toString() === 'RIFF' && audio.subarray(8,12).toString() === 'WAVE'
    : audio.subarray(0,3).toString() === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
  if (!signature) throw new SpeechError('录音文件损坏或格式不匹配，请重新录制。');
}
export async function transcribeAudio(audio: Buffer, mime: string, signal?: AbortSignal) {
  validateAudio(audio, mime);
  const cfg = speechConfig();
  let response: Response;
  try {
    response = await fetch(cfg.endpoint, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({model:cfg.model,input:{messages:[{role:'user',content:[{audio:`data:${mime};base64,${audio.toString('base64')}`}]}]},parameters:{result_format:'message',asr_options:{enable_itn:false}}}),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    });
  } catch { throw new SpeechError('转写连接中断或超时。录音仍保留，可点击重试。', 504); }
  // Provider error bodies can echo private audio or credentials. Do not expose them.
  if (!response.ok) {
    const text = response.status === 401 || response.status === 403 ? '语音服务未授权，请核对密钥与接入地域。'
      : response.status === 402 ? '语音服务余额不足，请检查百炼账户。'
      : response.status === 429 ? '语音服务暂时繁忙，请稍后重试。'
      : response.status === 400 || response.status === 404 ? '语音服务未接受录音，请核对模型权限、接入地址或录音长度。'
      : '语音服务暂时不可用，请稍后重试。';
    throw new SpeechError(text, 502);
  }
  const result = await response.json().catch(() => null);
  const choice = result?.output?.choices?.[0];
  const content = choice?.message?.content;
  const text = Array.isArray(content) ? content.map((part: {text?: unknown}) => typeof part?.text === 'string' ? part.text : '').join('') : '';
  if (choice?.finish_reason !== 'stop' || !text.trim() || text.length > 20_000) throw new SpeechError('没有得到完整转写文字，请重试或重新录制。', 502);
  return { text: text.trim(), model: cfg.model };
}
