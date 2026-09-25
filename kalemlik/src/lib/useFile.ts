import {useEffect, useState} from 'react';
import {fileUrl} from './files';
import {builtinUrl} from '@/features/stickers/builtin';

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

/** Yerleştirilen görselin adresi: hazır sticker ise uygulama içi çizim, değilse kullanıcının dosyası. */
export function usePlacedUrl(p: {fileId?: string; builtin?: string}) {
  const fileUrl = useFileUrl(p.builtin ? undefined : p.fileId);
  return p.builtin ? builtinUrl(p.builtin) : fileUrl;
}
