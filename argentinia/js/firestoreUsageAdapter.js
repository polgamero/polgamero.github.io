import { recordServiceUsage as count, firestoreFeature } from './serviceUsage.js';

// The SDK and refs remain native singletons; only the exported operation boundary is observed.
export function createFirestoreUsageAdapter(sdk) {
  const observed = {};
  const queryFeatures = new WeakMap();
  const featureOf = (ref, isQuery = false) => queryFeatures.get(ref) || firestoreFeature(ref, isQuery);
  observed.collection = (...args) => {
    const ref = sdk.collection(...args);
    queryFeatures.set(ref, firestoreFeature(ref, true));
    return ref;
  };
  observed.query = (ref, ...args) => {
    const result = sdk.query(ref, ...args);
    queryFeatures.set(result, featureOf(ref, true));
    return result;
  };
  for (const name of ['getDoc', 'getDocFromServer', 'getDocs', 'getDocsFromServer', 'setDoc', 'updateDoc', 'deleteDoc']) {
    observed[name] = async (...args) => {
      const feature = featureOf(args[0], name.startsWith('getDocs'));
      count(feature, name.startsWith('get') ? 'readRequests' : name === 'deleteDoc' ? 'deleteAttempts' : 'writeAttempts');
      try {
        const result = await sdk[name](...args);
        if (name.startsWith('get')) {
          count(feature, result?.metadata?.fromCache ? 'cachedDocuments' : 'serverDocuments', result?.size ?? (result?.exists?.() ? 1 : 0));
        }
        return result;
      } catch (error) { count(feature, 'errors'); throw error; }
    };
  }
  observed.onSnapshot = (ref, ...args) => {
    const feature = featureOf(ref);
    count(feature, 'listenerStarts');
    const observe = snapshot => {
      try {
      count(feature, 'snapshotEvents');
      count(feature, snapshot.metadata?.fromCache ? 'cacheSnapshotEvents' : 'serverSnapshotEvents');
      // Metadata-only events may repeat a document without a billable server read.
      count(feature, 'snapshotDocuments', snapshot.docChanges?.().length ?? (snapshot.exists?.() ? 1 : 0));
      } catch { /* A diagnostic must never interrupt delivery to the game. */ }
    };
    // Preserve all SDK overloads, options, observer binding and unsubscribe behavior.
    const mapped = [...args];
    const index = args.findIndex(arg => typeof arg === 'function' || arg && (typeof arg.next === 'function' || typeof arg.error === 'function'));
    if (index >= 0) {
      const callback = args[index];
      mapped[index] = typeof callback === 'function' ? snapshot => { observe(snapshot); callback(snapshot); }
        : { next: snapshot => { observe(snapshot); callback.next?.(snapshot); }, error: error => { count(feature, 'errors'); callback.error?.(error); }, complete: () => callback.complete?.() };
      if (typeof callback === 'function' && typeof args[index + 1] === 'function') {
        mapped[index + 1] = error => { count(feature, 'errors'); args[index + 1](error); };
      }
    }
    const stop = sdk.onSnapshot(ref, ...mapped);
    let closed = false;
    return () => { if (!closed) { closed = true; count(feature, 'listenerStops'); stop(); } };
  };
  const wrapWriter = target => {
    let proxy;
    proxy = new Proxy(target, { get(object, key) {
      const value = Reflect.get(object, key, object);
      if (typeof value !== 'function') return value;
      return (...args) => {
        if (['get', 'set', 'update', 'delete'].includes(key)) count(firestoreFeature(args[0]), key === 'get' ? 'transactionReads' : key === 'delete' ? 'deleteAttempts' : 'writeAttempts');
        const result = value.apply(object, args);
        return result === object ? proxy : result;
      };
    } });
    return proxy;
  };
  observed.runTransaction = (db, callback, ...options) => sdk.runTransaction(db, tx => {
    count('Firestore / transacciones', 'transactionAttempts');
    return callback(wrapWriter(tx));
  }, ...options);
  observed.writeBatch = db => wrapWriter(sdk.writeBatch(db));
  return observed;
}
