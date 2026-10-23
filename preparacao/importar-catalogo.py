"""Importa o snapshot EDF somente na API local; nunca modifica EDFs ou o editor."""
from collections import Counter
import hashlib
import gzip
import json
import os
import re
from pathlib import Path
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from equipment_effects import build_baselines, extra_effects
# Células completas nas folhas DDS atuais; índices inválidos não impedem uso do modelo.
ICON_CAPACITY = {"WEAPON": 1024, "HELMET": 1008, "UPPER": 1008, "LOWER": 1008,
                 "GLOVES": 1008, "SHOES": 1008, "RING": 512, "AMULET": 512, "CLOAK": 512}


def prepare(snapshot):
    items, excluded = [], []
    for category, table in snapshot["tables"].items():
        records = table["records"]
        baselines = build_baselines(category, records)
        duplicates = {code for code, count in Counter(r["Code"] for r in records if r.get("IsExist") == 1).items() if count > 1}
        excluded.extend({"category": category, "gameCode": code.lower(), "reason": "Código repetido no EDF"} for code in sorted(duplicates))
        accessory = category in ("RING", "AMULET")
        for row in records:
            if row["Code"] in duplicates or row.get("IsExist") != 1:
                continue
            if not re.fullmatch(r'[a-z0-9]{2,50}', row['Code']):
                excluded.append({"category": category, "gameCode": row["Code"].lower(), "reason": "Código ainda não decodificado; indisponível para cadastro"})
                continue
            if category in ("HELMET", "UPPER", "LOWER", "GLOVES", "SHOES", "CLOAK") and (re.search(r'\[Rare\s+[DE]\]', row["Name"], re.IGNORECASE) or "party mask" in row["Name"].lower()):
                excluded.append({"category": category, "gameCode": row["Code"], "reason": "Armadura especial Rare D/E ou Party Mask desabilitada para equipamentos"})
                continue
            if not row["Name"].strip():
                excluded.append({"category": category, "gameCode": row["Code"], "reason": "Nome ausente no EDF/NDItem"})
                continue
            level = row["LvLim" if accessory else "LevelLim"]
            grade = row["Grade" if category == "WEAPON" else "ItemGrade"]
            if not 0 <= level <= 99 or not 0 <= grade <= 255:
                raise ValueError(f"Nível/grade fora do contrato: {row['Code']}")
            extras, effects_note = extra_effects(category, row, baselines)
            effects = [{"code": code, "value": float(value)} for code, value in extras.items()]
            icon = row.get("Icon")
            if type(icon) is not int or not 0 <= icon < ICON_CAPACITY[category]:
                icon = None
            items.append({"category": category, "gameCode": row["Code"], "name": row["Name"],
                          "level": level, "grade": grade, "effects": effects, "iconId": icon,
                          "itemType": str(row.get("Type", "")), "effectsNote": effects_note,
                          "civil": row.get("Civil"), "expertId": row.get("ExpertID1", 255 if accessory else None)})
    source_hash = hashlib.sha256("".join(s["sha256"] for s in snapshot["sources"]).encode()).hexdigest()
    return {"sourceHash": source_hash, "items": items, "excluded": excluded}


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        def row(code, active=1):
            return {"Code": code, "Name": code, "IsExist": active, "LvLim": 1, "ItemGrade": 0,
                    "Civil": "00110", "EffNum": 1, "EffCode1": 15, "EffUnit1": 0.08}
        result = prepare({"sources": [{"sha256": "a" * 64}], "tables": {
            "RING": {"records": [row("a1"), row("a1"), row("b1"), row("c1", 0), {**row("d1"), "Name": ""}]}}})
        assert [r["gameCode"] for r in result["items"]] == ["b1"]
        assert result["items"][0]["civil"] == "00110"
        assert result["items"][0]["expertId"] == 255
        assert result["items"][0]["effects"] == [{"code": 15, "value": 0.08}]
        for icon, expected in [(0, 0), (511, 511), (512, None), (4294967240, None), (-1, None)]:
            checked = prepare({"sources": [{"sha256": "a" * 64}], "tables": {"RING": {"records": [{**row("b1"), "Icon": icon}]}}})
            assert checked["items"][0]["iconId"] == expected
        assert [(i["category"],i["gameCode"]) for i in result["excluded"]] == [("RING","a1"),("RING","d1")]
        masks = prepare({"sources": [{"sha256": "a" * 64}], "tables": {"HELMET": {"records": [
            {**row("ihemz45"), "LevelLim": 55, "ItemGrade": 1, "Name": "Damaged Party Mask A [Rare D]", "EffNum": 0},
            {**row("ihemx45"), "LevelLim": 55, "ItemGrade": 1, "Name": "Party Mask A [Rare E]", "EffNum": 0}]}}})
        assert not masks["items"] and len(masks["excluded"]) == 2
        for category in ("HELMET", "UPPER", "LOWER", "GLOVES", "SHOES", "CLOAK"):
            armor = prepare({"sources": [{"sha256": "a" * 64}], "tables": {category: {"records": [
                {**row("ihemz28"), "LevelLim": 55, "Name": "Damaged New Half Mask [Rare D]", "EffNum": 0},
                {**row("ihemx28"), "LevelLim": 55, "Name": "New Half Mask[rare e]", "EffNum": 0},
                {**row("ihcwb50"), "LevelLim": 50, "Name": "Intense Armor [Rare B]", "EffNum": 0}]}}})
            assert [i["gameCode"] for i in armor["items"]] == ["ihcwb50"]
            assert len(armor["excluded"]) == 2
        unique_active = prepare({"sources": [{"sha256": "a" * 64}], "tables": {
            "RING": {"records": [row("one"), row("one", 0), row("one", 0)]}}})
        assert [i["gameCode"] for i in unique_active["items"]] == ["one"]
        with gzip.open(ROOT / "catalogo-equipamentos.json.gz", "rt", encoding="utf-8") as source:
            packaged = json.load(source)
        assert len(packaged["items"]) == 50612 and len(packaged["excluded"]) == 751
        assert len({(i["category"], i["gameCode"]) for i in packaged["items"]}) == len(packaged["items"])
        assert {i["gameCode"] for i in packaged["items"] if i["category"] == "CLOAK"} >= {"ikcc001", "ikcc006"}
        print("Self-check: códigos duplicados/inativos bloqueados e efeitos preservados.")
    else:
        token = os.environ.get("EQUIPMENT_LOCAL_TOKEN")
        if not token:
            raise SystemExit("Defina EQUIPMENT_LOCAL_TOKEN com o login administrador do banco local.")
        snapshot_path = ROOT / "catalogo-edf.local.json"
        if snapshot_path.exists():
            payload = prepare(json.loads(snapshot_path.read_text(encoding="utf-8")))
        else:
            with gzip.open(ROOT / "catalogo-equipamentos.json.gz", "rt", encoding="utf-8") as source:
                payload = json.load(source)
        request = Request("http://127.0.0.1:18080/api/equipment/catalog/import",
                          data=json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8"),
                          headers={"Content-Type": "application/json", "Authorization": "Bearer " + token}, method="POST")
        try:
            with urlopen(request, timeout=300) as response:
                result = json.load(response)
        except HTTPError as error:
            raise SystemExit(f"Importação recusada ({error.code}): {error.read().decode('utf-8')}") from None
        (ROOT / "evidencias").mkdir(exist_ok=True)
        (ROOT / "evidencias" / "catalogo-importado.json").write_text(
            json.dumps({"result": result, "sourceHash": payload["sourceHash"], "excluded": payload["excluded"]},
                       ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result))
