"""Attach the public R2 route behind the existing private Pages access worker."""
from pathlib import Path
import re


def wrap_private_worker(source):
    text = source.decode("utf-8")
    pattern = re.compile(r"\bexport\s+default\b")
    if len(pattern.findall(text)) != 1:
        raise ValueError("Private wrapper must have exactly one default export")
    text = pattern.sub("const PlayroomPrivateWorker =", text, count=1)
    route = (Path(__file__).resolve().parent / "pack-catalog-route.js").read_text(encoding="utf-8")
    adapter = """
export default {
  fetch(request, env, context) {
    const assets=env.ASSETS;
    const protectedEnv={...env,ASSETS:{fetch(resource){
      const path=new URL(resource.url||resource,request.url).pathname;
      if(path.startsWith('/api/packs/'))return PlayroomPackRoute.fetch(resource instanceof Request?resource:new Request(resource),env);
      return assets.fetch(resource);
    }}};
    return PlayroomPrivateWorker.fetch(request,protectedEnv,context);
  }
};
"""
    return (route + "\n" + text + "\n" + adapter).encode("utf-8")
