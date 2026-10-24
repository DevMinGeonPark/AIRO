export type PlacePhoto = { id:string; name:string; blob:Blob; addedAt:number };
type StoredPhoto = { id:string; name:string; bytes:ArrayBuffer; mime:string; addedAt:number };
const photosFromStorage = (rows:StoredPhoto[]):PlacePhoto[] => rows.map(({bytes,mime,...photo})=>({...photo,blob:new Blob([bytes],{type:mime})}));
const DB = "airo-place-photos", STORE = "places";
export const photoScope = (owner:string,trip:string,stop:string) => JSON.stringify([owner,trip,stop]);
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(DB,1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("다른 AIRO 창을 닫고 다시 시도해 주세요."));
    request.onsuccess = () => resolve(request.result);
  });
}
async function transact(scope:string, update?: (photos:StoredPhoto[])=>StoredPhoto[]): Promise<StoredPhoto[]> {
  const db = await openDatabase();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,update ? "readwrite" : "readonly"), store = tx.objectStore(STORE);
    let value:StoredPhoto[] = [], failure:unknown;
    const request = store.get(scope);
    request.onsuccess = () => { try { value = request.result ?? []; if (update) { value = update(value); store.put(value,scope); } } catch(error) { failure=error; tx.abort(); } };
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = event => { failure ??= (event.target as IDBRequest).error; };
    tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error("사진 저장소를 열지 못했어요.")); };
  });
}
export const readPlacePhotos = (scope:string) => transact(scope).then(photosFromStorage);
export const removePlacePhoto = (scope:string,id:string) => transact(scope,photos=>photos.filter(photo=>photo.id!==id)).then(photosFromStorage);
export async function addPlacePhotos(scope:string,files:File[]) {
  if (!files.length || files.length>10) throw new Error("사진은 한 번에 10장까지 선택해 주세요.");
  const additions:StoredPhoto[]=[];
  for(const file of files) {
    if(!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>20*1024*1024 || !file.size) throw new Error("JPEG·PNG·WebP 사진을 선택해 주세요. 한 장당 최대 20 MiB입니다.");
    const bytes = await file.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(b=>b.toString(16).padStart(2,"0")).join("");
    const bitmap = await createImageBitmap(file); bitmap.close();
    additions.push({id:hash,name:file.name,bytes,mime:file.type,addedAt:Date.now()});
  }
  return transact(scope,photos=>{
    const all = [...new Map([...photos,...additions].map(photo=>[photo.id,photo])).values()];
    if(all.length>20) throw new Error("한 장소에는 사진을 20장까지 연결할 수 있어요.");
    return all;
  }).then(photosFromStorage);
}
