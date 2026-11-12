"""xmind能够转csv

1. 先将字典生成utf-8格式的csv文件
    生成的csv文件导入禅道中只读取了用例标题



"""


import pandas as pd
from excel2cast import get_case
import xmind2json
from xmind2json import xmind_to_json
# help(xmind2json)

# def xmindTocsvfile():
#     data = {'所属模块':['/我的(#53)','/创作者中心(#177)'],'相关研发需求':["创作者中心(#87)","创作者中心(#87)"],'用例标题':["我的-查看更多-存在创作者中心入口","创作者中心-页面与UI图一致"]}
#     df =pd.DataFrame(data)
#
#     df.to_csv('testdata.csv',encoding='utf-8',index=False)
#
#
# if __name__ == '__main__':
#     xmindTocsvfile()

# 实践出真知

# xmind_to_json(file_path)

if __name__ == '__main__':
    a = input("请输入xmind名")
    # xmindToexcelfile('{0}.xmind'.format(a))
    xmind_to_json(a)





