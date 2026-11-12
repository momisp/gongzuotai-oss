"""从 XMind 提取禅道用例标题（逻辑与 integrated/test_tool/excel2cast.py 一致）"""
import re
import traceback

import xmindparser
from xmindparser import xmind_to_dict

xmindparser.config = {
    "showTopicId": False,
    "hideEmptyValue": True,
}


def traversal_xmind(root, rootstring, lisitcontainer, flag):
    try:
        if isinstance(root, dict):
            if "title" in root.keys() and "topics" in root.keys():
                traversal_xmind(root["topics"], str(rootstring), lisitcontainer, True)
            if "title" in root.keys() and "topics" not in root.keys():
                traversal_xmind(root["title"], str(rootstring), lisitcontainer, True)
        elif isinstance(root, list):
            flag = True
            for sonroot in root:
                if flag:
                    if "title" in sonroot.keys() and "topics" in sonroot.keys():
                        traversal_xmind(
                            sonroot["topics"],
                            str(rootstring) + "!" + sonroot["title"],
                            lisitcontainer,
                            True,
                        )
                    elif "title" in sonroot.keys() and "topics" not in sonroot.keys():
                        if "makers" in sonroot.keys() and "symbol-info" in sonroot["makers"]:
                            case = (
                                str(rootstring)
                                + "!"
                                + root[0]["title"]
                                + "!"
                                + root[1]["title"]
                                + "!"
                                + root[1]["topics"][0]["title"]
                            )
                            flag = False
                            traversal_xmind(case, case, lisitcontainer, flag)
                        else:
                            case = str(rootstring) + "!" + sonroot["title"]
                            traversal_xmind(case, case, lisitcontainer, True)
        elif isinstance(root, str):
            lisitcontainer.append(str(rootstring))
    except Exception:
        traceback.print_exc()


def get_case(root):
    rootstring = root["title"]
    lisitcontainer = []
    traversal_xmind(root, rootstring, lisitcontainer, True)
    return lisitcontainer


def row_case_to_title(row_case: str) -> str:
    """与 excel2cast.deal_with_list + write_sheet 的标题处理一致。"""
    case = row_case.split("!")
    caselength = len(case)
    if "前置条件" in row_case:
        casename = ""
        for i in range(0, caselength - 3):
            casename += case[i]
    else:
        casename = " "
        for i in range(2, caselength):
            casename = casename + "-" + case[i]
    return re.sub(r" -", "", str(casename)).strip()


def parse_xmind_titles(xmind_path: str) -> dict:
    sheets = xmind_to_dict(xmind_path)
    if not sheets:
        raise ValueError("xmind 文件为空或无法解析")
    root = sheets[0]["topic"]
    sheet_title = root.get("title", "未命名")
    case_list = get_case(root)
    titles = []
    for row_case in case_list:
        try:
            title = row_case_to_title(row_case)
            if title:
                titles.append(title)
        except Exception:
            continue
    return {
        "sheet": sheet_title,
        "titles": titles,
        "total": len(titles),
    }
