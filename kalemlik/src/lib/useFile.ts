import {useEffect, useState} from 'react';
import {fileUrl} from './files';

/** Dosya kimliğinden gösterilebilir adres (önce cihazdaki kopya). */
export function useFileUrl(id: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (id) void fileUrl(id).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id]);
  return url;
}
