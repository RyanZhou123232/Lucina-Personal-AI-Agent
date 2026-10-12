// Routing adapter; speech service and validation live in backend.
export {GET,POST} from '@/backend/routes/speech/transcribe/route';
export const runtime='nodejs';
export const maxDuration=120;
