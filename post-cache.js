// Extension-origin IndexedDB. Point lookups never scan or update the cache.
globalThis.XCTPostCache = (() => {
  const capacity = 4096;
  let opening;
  function database() {
    if (!opening) opening = new Promise((resolve,reject) => {
      const request = indexedDB.open('xct-post-translations',1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('translations');
        request.result.createObjectStore('slots');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {db.close();opening=undefined;};
        resolve(db);
      };
      request.onerror = () => {opening=undefined;reject(request.error);};
    });
    return opening;
  }
  function scope(config) {
    return config ? ['agentrelay',config.address,config.provider,config.sessionId] : ['google'];
  }
  async function key(scope, language, source) {
    const bytes = new TextEncoder().encode(JSON.stringify([1,scope,language,source]));
    const hash = await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  async function lookup(scope, language, items) {
    const keys = await Promise.all(items.map(item=>key(scope,language,item.text)));
    const db = await database();
    const store = db.transaction('translations').objectStore('translations');
    return Promise.all(keys.map((key,i)=>new Promise((resolve,reject)=>{
      const request = store.get(key);
      request.onsuccess = () => resolve({id:items[i].id,key,translation:request.result});
      request.onerror = () => reject(request.error);
    })));
  }
  async function save(entries) {
    if (!entries.length) return;
    const db = await database();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(['translations','slots'],'readwrite');
      const values = tx.objectStore('translations'), slots = tx.objectStore('slots');
      // The ring pointer and payload changes commit together across tabs/workers.
      const head = slots.get('next');
      head.onsuccess = () => {
        let next = head.result || 0;
        function insert(i) {
          if (i === entries.length) {slots.put(next,'next');return;}
          const {key,translation} = entries[i];
          if (!key || typeof translation !== 'string' || !translation.trim()) {insert(i+1);return;}
          const present = values.getKey(key);
          present.onsuccess = () => {
            if (present.result !== undefined) {insert(i+1);return;}
            const slot = next;
            next = (next + 1) % capacity;
            const old = slots.get(slot);
            old.onsuccess = () => {
              if (old.result !== undefined) values.delete(old.result);
              slots.put(key,slot);values.put(translation,key);insert(i+1);
            };
          };
        }
        insert(0);
      };
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
    });
  }
  return {scope,key,lookup,save};
})();
