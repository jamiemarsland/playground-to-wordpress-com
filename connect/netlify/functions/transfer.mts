import { origin } from './wordpress.mts';
import { authenticate,csrf,response,preflight,storage,handleTransfer } from './_shared/transfer-core.mts';
export default async function handler(req,context) {
  const session=authenticate(req);
  if(!session) return response({error:'Your connection expired. Sign in again before starting a transfer.'},401);
  try {
    if(new URL(req.url).pathname==='/api/connection' && req.method==='GET') {
      const site=await preflight(session);return response({...site,csrf:csrf(session)});
    }
    if(req.method!=='POST') return response({error:'Method not allowed.'},405);
    if(req.headers.get('origin')!==origin()||req.headers.get('x-pgwpc-csrf')!==csrf(session)) return response({error:'Request rejected.'},403);
    return await handleTransfer(req,storage(context),session);
  } catch(error) {return response({error:String(error.message).slice(0,800)},400);}
}
export const config={path:['/api/connection','/api/transfer']};
