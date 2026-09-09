import { storage,cleanChunks } from './_shared/transfer-core.mts';
export default async function handler(req,context) {
  const store=storage(context);
  for await(const page of store.list({prefix:'baselines/',paginate:true})) {
    for(const item of page.blobs) {
      const metadata=await store.getMetadata(item.key);
      if(metadata?.metadata?.exp<Date.now())await store.delete(item.key);
    }
  }
  for await(const page of store.list({prefix:'jobs/',paginate:true})) {
    for(const item of page.blobs) {
      const job=await store.get(item.key,{type:'json'});
      if(job?.exp<Date.now()) {
        await cleanChunks(store,job);
        await store.delete('locks/'+job.id);await store.delete('start-locks/'+job.id);await store.delete(item.key);
      }
    }
  }
}
export const config={schedule:'@hourly'};
