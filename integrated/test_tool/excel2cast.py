"""
此为网上xmind转excel的脚本，能够使用
通过修改将其改成合适自己的快捷功能
进行迭代，在原有基础功能上增加导入禅道与批量导入禅道两个版本


9.19
导入禅道的是csv文件，需要将




"""

import xmindparser
import xlwt, xlrd
from xlutils.copy import copy
from xlwt import Worksheet
from xmindparser import xmind_to_dict
import datetime
import os
import re
import traceback
import pandas as pd

# import chardet

# 当前时间戳
a = datetime.datetime.now().strftime('%Y-%m-%d%H:%M:%S')
timestp = re.sub(r'-|:|\s', '', str(a))

# 根目录
base_dir = os.path.abspath(os.path.dirname(__file__))

# xmindparser配置 showTopicId: 控制是否在输出中显示主题ID，默认为False。
# hideEmptyValue: 控制是否隐藏空值，默认为True，即隐藏空值。
xmindparser.config = {
    'showTopicId': False,  # 是否展示主题ID
    'hideEmptyValue': True  # 是否隐藏空值
}


def traversal_xmind(root, rootstring, lisitcontainer, flag):
    """
    功能：递归dictionary文件得到容易写入Excel形式的格式。
    注意：rootstring都用str来处理中文字符
    @param root: 将xmind处理后的dictionary文件
    @param rootstring: xmind根标题
    @param lisitcontainer: list容器存放数据
    @param flag: 特殊标记标签
    """
    # 这个方法中是用来遍历字典中的值，将其组合写入列表中 ，flag为True时，不写入，为False时写入
    # 这个方法逻辑比较难理解，但大致就是通过不断的遍历，将字典中的数据用 ！ 拼接起来，写入列表中

    try:
        # 判断数据是否是字典类型
        if isinstance(root, dict):
            print('root1:', root)
            # 如果这个字典的key中同时有title和topics，则可认为这个title有下级分支
            #
            if 'title' in root.keys() and 'topics' in root.keys():
                # 对这个字典再次进行处理
                traversal_xmind(root['topics'], str(rootstring), lisitcontainer, True)
            # 如果这个字典的key中有title且没有topics，则可认为这个title是最末端
            if 'title' in root.keys() and 'topics' not in root.keys():
                traversal_xmind(root['title'], str(rootstring), lisitcontainer, True)

        # 判断数据是否是列表类型
        elif isinstance(root, list):
            #
            flag = True
            # 遍历列表
            for sonroot in root:
                # sonroot只可能是dict类型
                # 如果这个字典的key中同时有title和topics，则可认为这个title有下级分支
                if flag:
                    if 'title' in sonroot.keys() and 'topics' in sonroot.keys():
                        traversal_xmind(sonroot['topics'], str(rootstring) + "!" + sonroot['title'], lisitcontainer,
                                        True)
                    # 如果这个字典的key中有title且没有topics，则可认为这个title是最末端
                    elif 'title' in sonroot.keys() and 'topics' not in sonroot.keys():
                        # # 判断蓝色感叹号标识（前置条件）是否存在
                        if 'makers' in sonroot.keys() and 'symbol-info' in sonroot['makers']:
                            case = str(rootstring) + "!" + root[0]['title'] + "!" + root[1]['title'] + "!" + \
                                   root[1]['topics'][0]['title']
                            # 如果有特殊标签，则改变flag状态
                            flag = False
                            traversal_xmind(case, case, lisitcontainer, flag)
                        else:
                            case = str(rootstring) + "!" + sonroot['title']
                            traversal_xmind(case, case, lisitcontainer, True)

        # 判断数据是否是字符串类型
        elif isinstance(root, str):
            # lisitcontainer.append(str(rootstring.replace('\n', '')))  # 此处是去掉一步骤多结果情况直接拼接
            lisitcontainer.append(str(rootstring))  # 此处是一步骤多结果时，多结果合并
            # print('lisitcontainer:', lisitcontainer)
    except:
        tips = 'xmind处理异常，请联系Dora！！！'
        # 输出异常信息
        traceback.print_exc()


# 将xmind中的每条用例提取出来，放入列表中，以逗号分隔
def get_case(root):
    rootstring = root['title']
    print("字典转化列表，读取标题-{0}".format(rootstring))
    lisitcontainer = []
    # 这个方法是自己写的方法
    traversal_xmind(root, rootstring, lisitcontainer, True)
    return lisitcontainer


# 写入第b行的用例数据内容   ----写入的方法在这里，需要修改就在这里改
def write_sheet(Worksheet, b, casemode, casename):
    '''
    功能解释：去掉用例中的换行符，写入一条用例到Excel中
    @param Worksheet: excel表对象
    @param b: 写入的数据在表中所处的行数
    @param casename: 用例名称
    @param casestep: 用例操作
    @param expectresult: 期望结果
    '''
    # 用例名称   将传入的用例名称去掉换行符 str处理 ，其他同理，  这边是处理所属模块加编号， 填写相关研发需求，优先级等字段的地方
    print('用例名称：', casename)
    caseName = re.sub(r' -', '', str(casename))
    print('处理后的用例名称：', caseName)
    # 用例步骤
    # caseStep = re.sub(r'\r\n', '', str(casestep))
    # 期望结果
    # expectResult = re.sub(r'\r\n', '', str(expectresult))

    # 然后写入 execl 表格中的指定行数   （这里修改表格中固定的字段）
    Worksheet.write(b, 0, casemode)  # 所属模块
    # Worksheet.write(b, 1, caseStep)  # 用例步骤
    Worksheet.write(b, 2, caseName)  # 用例名称
    Worksheet.write(b, 1, "创作者中心(#87)")  # 相关研发需求
    Worksheet.write(b, 7, "3")  # 优先级
    Worksheet.write(b, 8, "功能测试")  # 用例类型
    Worksheet.write(b, 9, "版本验证阶段")  # 适用阶段


# 处理xmind数据 传入 excel文件表格与 存有总标题，测试模块，测试标题的列表，以！分隔开 ，要转成csv文件，应该就是在这边调整
def deal_with_list(Worksheet, case_list):
    '''
    功能解释：处理从xmind转换过来的用例list，并写入Excel中
    @param Worksheet: excel表对象
    @param case_list: 通过xmind转换好的用例列表
    '''
    tips = 'excel表格处理成功！！！'

    # 这块逻辑用来处理 xmind

    b = 1  # 记录写了多少行
    for row_case in case_list:
        case = row_case.split("!")  # 将字段 用 ！ 分隔 开，成一个列表
        caselength = len(case) # 统计列表中有几个元素
        try:
            if '前置条件' in row_case:
                casename = ''
                for i in range(0, caselength - 3):
                    casename += case[i]  # 用例标题，（默认为从倒数第4个下标往前都是用例标题）
                casestep = case[-3] + case[-2]  # 用例步骤，（倒数第2个下标是步骤，倒数第3个下标识前置条件(必须有前置条件)
                expectresult = case[-1]  # 预期结果，（倒数第1个下标是预期结果）
                write_sheet(Worksheet, b, casename, casestep, expectresult)  # 写入Excel

            else:
                # casename = ''
                # # 这个是我改编的
                # for i in range(2, caselength):
                #     casename += case[i]  # 用例标题
                # print(casename)
                # casemode = case[1]  # 所属模块
                # # expectresult = case[-1]  # 预期结果，（倒数第1个下标是预期结果）
                # # print(expectresult)
                # write_sheet(Worksheet, b, casemode, casename)  # 写入Excel

                # 走这块代码 ，用例标题有 - 分隔
                casename = ' '
                # 这个是我改编的
                for i in range(2, caselength):
                    casename = casename + '-' + case[i]  # 用例标题
                print(casename)
                casemode = case[1]  # 所属模块
                # expectresult = case[-1]  # 预期结果，（倒数第1个下标是预期结果）
                # print(expectresult)
                write_sheet(Worksheet, b, casemode, casename)  # 写入Excel



                # for i in range(0, caselength - 2):
                #     casename += case[i]  # 用例标题，（无前置条件的情况下，默认为从倒数第3个下标往前都是用例标题）
                # casestep = case[-2]  # 用例步骤，（倒数第2个下标是步骤)
                # expectresult = case[-1]  # 预期结果，（倒数第1个下标是预期结果）
                # # print(expectresult)
                # write_sheet(Worksheet, b, casename, casestep, expectresult)  # 写入Excel
        except:
            tips = 'excel表格处理异常，请联系Dora！！！'
            print('异常tips:', tips)
            # 输出异常信息
            traceback.print_exc()
        b = b + 1
    return tips


def xmindToexcelfile(uploadPath):
    # 创建一个Workbook对象 编码encoding
    Workbook = xlwt.Workbook(encoding='utf-8', style_compression=0)
    # 添加一个sheet工作表、sheet名命名为Sheet1、cell_overwrite_ok=True允许覆盖写
    Worksheet = Workbook.add_sheet('Sheet1', cell_overwrite_ok=True)
    Worksheet.write(0, 0, '所属模块')
    Worksheet.write(0, 1, '相关研发需求')
    Worksheet.write(0, 2, '用例标题')
    Worksheet.write(0, 3, '前置条件')
    Worksheet.write(0, 4, '步骤')
    Worksheet.write(0, 5, '预期')
    Worksheet.write(0, 6, '关键词')
    Worksheet.write(0, 7, '优先级')
    Worksheet.write(0, 8, '用例类型')
    Worksheet.write(0, 9, '适用阶段')
    Worksheet.write(0, 10, '')
    Worksheet.write(0, 11, '类型可选值列表')
    Worksheet.write(0, 12, '阶段可选值列表')
    root = xmind_to_dict(uploadPath)[0]['topic']  # 解析成dict数据类型xmindparser.xmind_to_dict(filePath)
    print('root:', root)
    # 这里是自己写的方法
    case_list = get_case(root)
    print('case:', case_list)

    # 这一步，将列表中整合的用例数据，写入csv中   在这个方法中，将第一个感叹号到第二个感叹号的数据，处理成所属模块的内容，第二个感叹号后面的内容，都处理成用例标题，
    tips = deal_with_list(Worksheet, case_list)

    # Excel表保存的文件名字
    # savepath = os.path.abspath(os.path.dirname(__file__)) + '\\excelFiles\\' + root["title"] + timestp + ".xls"
    savepath = os.path.abspath(os.path.dirname(__file__)) + '\\excelFiles\\' + root["title"] + timestp + ".csv"
    # savepath = r"C:\Users\Administrator\Desktop\testdemo"

    Workbook.save(savepath)  # 此处可以填写生成文件的路径
    # # df = pd.read_csv(savepath)
    #
    # # for i in ('gbk', 'utf-8', 'gb18030', 'ansi'):
    # #     try:
    # df = pd.read_csv(savepath)
    #     #     print(i + 'decode success')
    #     # except:
    #     #     print(i + 'decode fail')

    # df.to_csv('output.csv', index=False, encoding='UTF-8')
    print("保存成功")
    return tips


# 将csv文件保存成utf-8编码的文件


if __name__ == '__main__':
    a = input("请输入xmind名（不用带.xmind）")
    xmindToexcelfile('{0}.xmind'.format(a))
    # xmindToexcelfile('xmin转换测试用例测试用.xmind'.format(a))
    #
    # df = pd.read_csv(filename='excelFiles/测试点20240921104623.csv')
    # df.to_csv('output.csv', index=False, encoding='UTF-8')
    # 使用方法
    # xmind_to_csv('xmin转换测试用例测试用.xmind', 'output.csv')
