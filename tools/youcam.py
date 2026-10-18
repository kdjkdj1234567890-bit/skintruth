"""Minimal YouCam API client: file upload + skin-analysis task + polling."""
import json, os, time, urllib.request

BASE = os.environ.get("YOUCAM_API_BASE", "https://yce-api-01.makeupar.com")
KEY = os.environ["YOUCAM_API_KEY"]

def _req(method, url, data=None, headers=None, raw=None):
    h = {"Authorization": f"Bearer {KEY}"}
    if headers: h.update(headers)
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    if data is not None: h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=body, headers=h, method=method)
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read().decode())

def balance():
    return _req("GET", f"{BASE}/s2s/v1.0/client/credit")

def upload_file(path, content_type="image/png"):
    size = os.path.getsize(path)
    name = os.path.basename(path)
    init = _req("POST", f"{BASE}/s2s/v2.0/file",
                {"files": [{"content_type": content_type, "file_name": name, "file_size": size}]})
    f = init["data"]["files"][0]
    req = f["requests"][0]
    with open(path, "rb") as fh:
        raw = fh.read()
    put = urllib.request.Request(req["url"], data=raw, method="PUT")
    for k, v in req.get("headers", {}).items():
        put.add_header(k, v)
    with urllib.request.urlopen(put, timeout=120) as resp:
        assert resp.status in (200, 201, 204), resp.status
    return f["file_id"]

def skin_analysis(file_id, actions, hd=False):
    return _req("POST", f"{BASE}/s2s/v2.0/task/skin-analysis",
                {"src_file_id": file_id, "dst_actions": actions, "format": "json"})

def task_status(task_id):
    return _req("GET", f"{BASE}/s2s/v2.0/task/skin-analysis/{task_id}")

def wait_task(task_id, timeout=180):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = task_status(task_id)
        s = st["data"]["task_status"]
        if s in ("success", "error"):
            return st
        time.sleep(3)
    raise TimeoutError(task_id)

if __name__ == "__main__":
    import sys
    print("balance before:", json.dumps(balance()))
    fid = upload_file(sys.argv[1])
    print("file_id:", fid[:40], "...")
    actions = ["wrinkle","pore","texture","acne","moisture","oiliness","redness","dark_circle","eye_bag","firmness","radiance","age_spot"]
    task = skin_analysis(fid, actions)
    print("task:", json.dumps(task)[:200])
    tid = task["data"]["task_id"]
    res = wait_task(tid)
    print("status:", res["data"]["task_status"])
    out = res["data"]["results"]["output"]
    for o in out:
        print(f"  {o['type']:<15} ui={o.get('ui_score')} raw={o.get('raw_score')}")
    print("balance after:", json.dumps(balance()))
