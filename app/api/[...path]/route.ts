import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handleApi} from '../../../lib/api';
export const dynamic='force-dynamic';
async function handler(request:Request){const user=await getChatGPTUser();return handleApi(request,env,user?.userId||null)}
export const GET=handler;export const POST=handler;export const PUT=handler;export const DELETE=handler;
