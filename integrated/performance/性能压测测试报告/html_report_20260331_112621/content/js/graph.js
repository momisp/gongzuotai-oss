/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
});


var responseTimePercentilesInfos = {
        data: {"result": {"minY": 682.0, "minX": 0.0, "maxY": 1853.0, "series": [{"data": [[0.0, 682.0], [0.1, 682.0], [0.2, 682.0], [0.3, 682.0], [0.4, 682.0], [0.5, 838.0], [0.6, 838.0], [0.7, 838.0], [0.8, 838.0], [0.9, 838.0], [1.0, 850.0], [1.1, 850.0], [1.2, 850.0], [1.3, 850.0], [1.4, 850.0], [1.5, 878.0], [1.6, 878.0], [1.7, 878.0], [1.8, 878.0], [1.9, 878.0], [2.0, 883.0], [2.1, 883.0], [2.2, 883.0], [2.3, 883.0], [2.4, 883.0], [2.5, 899.0], [2.6, 899.0], [2.7, 899.0], [2.8, 899.0], [2.9, 899.0], [3.0, 911.0], [3.1, 911.0], [3.2, 911.0], [3.3, 911.0], [3.4, 911.0], [3.5, 929.0], [3.6, 929.0], [3.7, 929.0], [3.8, 929.0], [3.9, 929.0], [4.0, 934.0], [4.1, 934.0], [4.2, 934.0], [4.3, 934.0], [4.4, 934.0], [4.5, 935.0], [4.6, 935.0], [4.7, 935.0], [4.8, 935.0], [4.9, 935.0], [5.0, 954.0], [5.1, 954.0], [5.2, 954.0], [5.3, 954.0], [5.4, 954.0], [5.5, 958.0], [5.6, 958.0], [5.7, 958.0], [5.8, 958.0], [5.9, 958.0], [6.0, 959.0], [6.1, 959.0], [6.2, 959.0], [6.3, 959.0], [6.4, 959.0], [6.5, 961.0], [6.6, 961.0], [6.7, 961.0], [6.8, 961.0], [6.9, 961.0], [7.0, 962.0], [7.1, 962.0], [7.2, 962.0], [7.3, 962.0], [7.4, 962.0], [7.5, 967.0], [7.6, 967.0], [7.7, 967.0], [7.8, 967.0], [7.9, 967.0], [8.0, 973.0], [8.1, 973.0], [8.2, 973.0], [8.3, 973.0], [8.4, 973.0], [8.5, 987.0], [8.6, 987.0], [8.7, 987.0], [8.8, 987.0], [8.9, 987.0], [9.0, 987.0], [9.1, 987.0], [9.2, 987.0], [9.3, 987.0], [9.4, 987.0], [9.5, 992.0], [9.6, 992.0], [9.7, 992.0], [9.8, 992.0], [9.9, 992.0], [10.0, 992.0], [10.1, 992.0], [10.2, 992.0], [10.3, 992.0], [10.4, 992.0], [10.5, 1009.0], [10.6, 1009.0], [10.7, 1009.0], [10.8, 1009.0], [10.9, 1009.0], [11.0, 1011.0], [11.1, 1011.0], [11.2, 1011.0], [11.3, 1011.0], [11.4, 1011.0], [11.5, 1012.0], [11.6, 1012.0], [11.7, 1012.0], [11.8, 1012.0], [11.9, 1012.0], [12.0, 1023.0], [12.1, 1023.0], [12.2, 1023.0], [12.3, 1023.0], [12.4, 1023.0], [12.5, 1027.0], [12.6, 1027.0], [12.7, 1027.0], [12.8, 1027.0], [12.9, 1027.0], [13.0, 1033.0], [13.1, 1033.0], [13.2, 1033.0], [13.3, 1033.0], [13.4, 1033.0], [13.5, 1038.0], [13.6, 1038.0], [13.7, 1038.0], [13.8, 1038.0], [13.9, 1038.0], [14.0, 1053.0], [14.1, 1053.0], [14.2, 1053.0], [14.3, 1053.0], [14.4, 1053.0], [14.5, 1062.0], [14.6, 1062.0], [14.7, 1062.0], [14.8, 1062.0], [14.9, 1062.0], [15.0, 1076.0], [15.1, 1076.0], [15.2, 1076.0], [15.3, 1076.0], [15.4, 1076.0], [15.5, 1078.0], [15.6, 1078.0], [15.7, 1078.0], [15.8, 1078.0], [15.9, 1078.0], [16.0, 1082.0], [16.1, 1082.0], [16.2, 1082.0], [16.3, 1082.0], [16.4, 1082.0], [16.5, 1082.0], [16.6, 1082.0], [16.7, 1082.0], [16.8, 1082.0], [16.9, 1082.0], [17.0, 1082.0], [17.1, 1082.0], [17.2, 1082.0], [17.3, 1082.0], [17.4, 1082.0], [17.5, 1093.0], [17.6, 1093.0], [17.7, 1093.0], [17.8, 1093.0], [17.9, 1093.0], [18.0, 1110.0], [18.1, 1110.0], [18.2, 1110.0], [18.3, 1110.0], [18.4, 1110.0], [18.5, 1116.0], [18.6, 1116.0], [18.7, 1116.0], [18.8, 1116.0], [18.9, 1116.0], [19.0, 1121.0], [19.1, 1121.0], [19.2, 1121.0], [19.3, 1121.0], [19.4, 1121.0], [19.5, 1123.0], [19.6, 1123.0], [19.7, 1123.0], [19.8, 1123.0], [19.9, 1123.0], [20.0, 1131.0], [20.1, 1131.0], [20.2, 1131.0], [20.3, 1131.0], [20.4, 1131.0], [20.5, 1134.0], [20.6, 1134.0], [20.7, 1134.0], [20.8, 1134.0], [20.9, 1134.0], [21.0, 1136.0], [21.1, 1136.0], [21.2, 1136.0], [21.3, 1136.0], [21.4, 1136.0], [21.5, 1139.0], [21.6, 1139.0], [21.7, 1139.0], [21.8, 1139.0], [21.9, 1139.0], [22.0, 1142.0], [22.1, 1142.0], [22.2, 1142.0], [22.3, 1142.0], [22.4, 1142.0], [22.5, 1142.0], [22.6, 1142.0], [22.7, 1142.0], [22.8, 1142.0], [22.9, 1142.0], [23.0, 1149.0], [23.1, 1149.0], [23.2, 1149.0], [23.3, 1149.0], [23.4, 1149.0], [23.5, 1155.0], [23.6, 1155.0], [23.7, 1155.0], [23.8, 1155.0], [23.9, 1155.0], [24.0, 1162.0], [24.1, 1162.0], [24.2, 1162.0], [24.3, 1162.0], [24.4, 1162.0], [24.5, 1168.0], [24.6, 1168.0], [24.7, 1168.0], [24.8, 1168.0], [24.9, 1168.0], [25.0, 1173.0], [25.1, 1173.0], [25.2, 1173.0], [25.3, 1173.0], [25.4, 1173.0], [25.5, 1174.0], [25.6, 1174.0], [25.7, 1174.0], [25.8, 1174.0], [25.9, 1174.0], [26.0, 1186.0], [26.1, 1186.0], [26.2, 1186.0], [26.3, 1186.0], [26.4, 1186.0], [26.5, 1186.0], [26.6, 1186.0], [26.7, 1186.0], [26.8, 1186.0], [26.9, 1186.0], [27.0, 1186.0], [27.1, 1186.0], [27.2, 1186.0], [27.3, 1186.0], [27.4, 1186.0], [27.5, 1191.0], [27.6, 1191.0], [27.7, 1191.0], [27.8, 1191.0], [27.9, 1191.0], [28.0, 1192.0], [28.1, 1192.0], [28.2, 1192.0], [28.3, 1192.0], [28.4, 1192.0], [28.5, 1201.0], [28.6, 1201.0], [28.7, 1201.0], [28.8, 1201.0], [28.9, 1201.0], [29.0, 1203.0], [29.1, 1203.0], [29.2, 1203.0], [29.3, 1203.0], [29.4, 1203.0], [29.5, 1206.0], [29.6, 1206.0], [29.7, 1206.0], [29.8, 1206.0], [29.9, 1206.0], [30.0, 1208.0], [30.1, 1208.0], [30.2, 1208.0], [30.3, 1208.0], [30.4, 1208.0], [30.5, 1210.0], [30.6, 1210.0], [30.7, 1210.0], [30.8, 1210.0], [30.9, 1210.0], [31.0, 1211.0], [31.1, 1211.0], [31.2, 1211.0], [31.3, 1211.0], [31.4, 1211.0], [31.5, 1211.0], [31.6, 1211.0], [31.7, 1211.0], [31.8, 1211.0], [31.9, 1211.0], [32.0, 1211.0], [32.1, 1211.0], [32.2, 1211.0], [32.3, 1211.0], [32.4, 1211.0], [32.5, 1225.0], [32.6, 1225.0], [32.7, 1225.0], [32.8, 1225.0], [32.9, 1225.0], [33.0, 1230.0], [33.1, 1230.0], [33.2, 1230.0], [33.3, 1230.0], [33.4, 1230.0], [33.5, 1231.0], [33.6, 1231.0], [33.7, 1231.0], [33.8, 1231.0], [33.9, 1231.0], [34.0, 1231.0], [34.1, 1231.0], [34.2, 1231.0], [34.3, 1231.0], [34.4, 1231.0], [34.5, 1250.0], [34.6, 1250.0], [34.7, 1250.0], [34.8, 1250.0], [34.9, 1250.0], [35.0, 1251.0], [35.1, 1251.0], [35.2, 1251.0], [35.3, 1251.0], [35.4, 1251.0], [35.5, 1257.0], [35.6, 1257.0], [35.7, 1257.0], [35.8, 1257.0], [35.9, 1257.0], [36.0, 1264.0], [36.1, 1264.0], [36.2, 1264.0], [36.3, 1264.0], [36.4, 1264.0], [36.5, 1266.0], [36.6, 1266.0], [36.7, 1266.0], [36.8, 1266.0], [36.9, 1266.0], [37.0, 1269.0], [37.1, 1269.0], [37.2, 1269.0], [37.3, 1269.0], [37.4, 1269.0], [37.5, 1279.0], [37.6, 1279.0], [37.7, 1279.0], [37.8, 1279.0], [37.9, 1279.0], [38.0, 1282.0], [38.1, 1282.0], [38.2, 1282.0], [38.3, 1282.0], [38.4, 1282.0], [38.5, 1284.0], [38.6, 1284.0], [38.7, 1284.0], [38.8, 1284.0], [38.9, 1284.0], [39.0, 1287.0], [39.1, 1287.0], [39.2, 1287.0], [39.3, 1287.0], [39.4, 1287.0], [39.5, 1291.0], [39.6, 1291.0], [39.7, 1291.0], [39.8, 1291.0], [39.9, 1291.0], [40.0, 1303.0], [40.1, 1303.0], [40.2, 1303.0], [40.3, 1303.0], [40.4, 1303.0], [40.5, 1313.0], [40.6, 1313.0], [40.7, 1313.0], [40.8, 1313.0], [40.9, 1313.0], [41.0, 1317.0], [41.1, 1317.0], [41.2, 1317.0], [41.3, 1317.0], [41.4, 1317.0], [41.5, 1317.0], [41.6, 1317.0], [41.7, 1317.0], [41.8, 1317.0], [41.9, 1317.0], [42.0, 1318.0], [42.1, 1318.0], [42.2, 1318.0], [42.3, 1318.0], [42.4, 1318.0], [42.5, 1338.0], [42.6, 1338.0], [42.7, 1338.0], [42.8, 1338.0], [42.9, 1338.0], [43.0, 1340.0], [43.1, 1340.0], [43.2, 1340.0], [43.3, 1340.0], [43.4, 1340.0], [43.5, 1366.0], [43.6, 1366.0], [43.7, 1366.0], [43.8, 1366.0], [43.9, 1366.0], [44.0, 1366.0], [44.1, 1366.0], [44.2, 1366.0], [44.3, 1366.0], [44.4, 1366.0], [44.5, 1372.0], [44.6, 1372.0], [44.7, 1372.0], [44.8, 1372.0], [44.9, 1372.0], [45.0, 1372.0], [45.1, 1372.0], [45.2, 1372.0], [45.3, 1372.0], [45.4, 1372.0], [45.5, 1373.0], [45.6, 1373.0], [45.7, 1373.0], [45.8, 1373.0], [45.9, 1373.0], [46.0, 1390.0], [46.1, 1390.0], [46.2, 1390.0], [46.3, 1390.0], [46.4, 1390.0], [46.5, 1395.0], [46.6, 1395.0], [46.7, 1395.0], [46.8, 1395.0], [46.9, 1395.0], [47.0, 1396.0], [47.1, 1396.0], [47.2, 1396.0], [47.3, 1396.0], [47.4, 1396.0], [47.5, 1396.0], [47.6, 1396.0], [47.7, 1396.0], [47.8, 1396.0], [47.9, 1396.0], [48.0, 1401.0], [48.1, 1401.0], [48.2, 1401.0], [48.3, 1401.0], [48.4, 1401.0], [48.5, 1401.0], [48.6, 1401.0], [48.7, 1401.0], [48.8, 1401.0], [48.9, 1401.0], [49.0, 1411.0], [49.1, 1411.0], [49.2, 1411.0], [49.3, 1411.0], [49.4, 1411.0], [49.5, 1412.0], [49.6, 1412.0], [49.7, 1412.0], [49.8, 1412.0], [49.9, 1412.0], [50.0, 1412.0], [50.1, 1412.0], [50.2, 1412.0], [50.3, 1412.0], [50.4, 1412.0], [50.5, 1413.0], [50.6, 1413.0], [50.7, 1413.0], [50.8, 1413.0], [50.9, 1413.0], [51.0, 1419.0], [51.1, 1419.0], [51.2, 1419.0], [51.3, 1419.0], [51.4, 1419.0], [51.5, 1439.0], [51.6, 1439.0], [51.7, 1439.0], [51.8, 1439.0], [51.9, 1439.0], [52.0, 1443.0], [52.1, 1443.0], [52.2, 1443.0], [52.3, 1443.0], [52.4, 1443.0], [52.5, 1443.0], [52.6, 1443.0], [52.7, 1443.0], [52.8, 1443.0], [52.9, 1443.0], [53.0, 1446.0], [53.1, 1446.0], [53.2, 1446.0], [53.3, 1446.0], [53.4, 1446.0], [53.5, 1461.0], [53.6, 1461.0], [53.7, 1461.0], [53.8, 1461.0], [53.9, 1461.0], [54.0, 1465.0], [54.1, 1465.0], [54.2, 1465.0], [54.3, 1465.0], [54.4, 1465.0], [54.5, 1471.0], [54.6, 1471.0], [54.7, 1471.0], [54.8, 1471.0], [54.9, 1471.0], [55.0, 1474.0], [55.1, 1474.0], [55.2, 1474.0], [55.3, 1474.0], [55.4, 1474.0], [55.5, 1475.0], [55.6, 1475.0], [55.7, 1475.0], [55.8, 1475.0], [55.9, 1475.0], [56.0, 1491.0], [56.1, 1491.0], [56.2, 1491.0], [56.3, 1491.0], [56.4, 1491.0], [56.5, 1497.0], [56.6, 1497.0], [56.7, 1497.0], [56.8, 1497.0], [56.9, 1497.0], [57.0, 1501.0], [57.1, 1501.0], [57.2, 1501.0], [57.3, 1501.0], [57.4, 1501.0], [57.5, 1501.0], [57.6, 1501.0], [57.7, 1501.0], [57.8, 1501.0], [57.9, 1501.0], [58.0, 1503.0], [58.1, 1503.0], [58.2, 1503.0], [58.3, 1503.0], [58.4, 1503.0], [58.5, 1505.0], [58.6, 1505.0], [58.7, 1505.0], [58.8, 1505.0], [58.9, 1505.0], [59.0, 1513.0], [59.1, 1513.0], [59.2, 1513.0], [59.3, 1513.0], [59.4, 1513.0], [59.5, 1514.0], [59.6, 1514.0], [59.7, 1514.0], [59.8, 1514.0], [59.9, 1514.0], [60.0, 1516.0], [60.1, 1516.0], [60.2, 1516.0], [60.3, 1516.0], [60.4, 1516.0], [60.5, 1517.0], [60.6, 1517.0], [60.7, 1517.0], [60.8, 1517.0], [60.9, 1517.0], [61.0, 1521.0], [61.1, 1521.0], [61.2, 1521.0], [61.3, 1521.0], [61.4, 1521.0], [61.5, 1522.0], [61.6, 1522.0], [61.7, 1522.0], [61.8, 1522.0], [61.9, 1522.0], [62.0, 1527.0], [62.1, 1527.0], [62.2, 1527.0], [62.3, 1527.0], [62.4, 1527.0], [62.5, 1528.0], [62.6, 1528.0], [62.7, 1528.0], [62.8, 1528.0], [62.9, 1528.0], [63.0, 1529.0], [63.1, 1529.0], [63.2, 1529.0], [63.3, 1529.0], [63.4, 1529.0], [63.5, 1537.0], [63.6, 1537.0], [63.7, 1537.0], [63.8, 1537.0], [63.9, 1537.0], [64.0, 1541.0], [64.1, 1541.0], [64.2, 1541.0], [64.3, 1541.0], [64.4, 1541.0], [64.5, 1555.0], [64.6, 1555.0], [64.7, 1555.0], [64.8, 1555.0], [64.9, 1555.0], [65.0, 1561.0], [65.1, 1561.0], [65.2, 1561.0], [65.3, 1561.0], [65.4, 1561.0], [65.5, 1568.0], [65.6, 1568.0], [65.7, 1568.0], [65.8, 1568.0], [65.9, 1568.0], [66.0, 1570.0], [66.1, 1570.0], [66.2, 1570.0], [66.3, 1570.0], [66.4, 1570.0], [66.5, 1573.0], [66.6, 1573.0], [66.7, 1573.0], [66.8, 1573.0], [66.9, 1573.0], [67.0, 1576.0], [67.1, 1576.0], [67.2, 1576.0], [67.3, 1576.0], [67.4, 1576.0], [67.5, 1577.0], [67.6, 1577.0], [67.7, 1577.0], [67.8, 1577.0], [67.9, 1577.0], [68.0, 1596.0], [68.1, 1596.0], [68.2, 1596.0], [68.3, 1596.0], [68.4, 1596.0], [68.5, 1605.0], [68.6, 1605.0], [68.7, 1605.0], [68.8, 1605.0], [68.9, 1605.0], [69.0, 1609.0], [69.1, 1609.0], [69.2, 1609.0], [69.3, 1609.0], [69.4, 1609.0], [69.5, 1624.0], [69.6, 1624.0], [69.7, 1624.0], [69.8, 1624.0], [69.9, 1624.0], [70.0, 1626.0], [70.1, 1626.0], [70.2, 1626.0], [70.3, 1626.0], [70.4, 1626.0], [70.5, 1630.0], [70.6, 1630.0], [70.7, 1630.0], [70.8, 1630.0], [70.9, 1630.0], [71.0, 1635.0], [71.1, 1635.0], [71.2, 1635.0], [71.3, 1635.0], [71.4, 1635.0], [71.5, 1642.0], [71.6, 1642.0], [71.7, 1642.0], [71.8, 1642.0], [71.9, 1642.0], [72.0, 1649.0], [72.1, 1649.0], [72.2, 1649.0], [72.3, 1649.0], [72.4, 1649.0], [72.5, 1658.0], [72.6, 1658.0], [72.7, 1658.0], [72.8, 1658.0], [72.9, 1658.0], [73.0, 1658.0], [73.1, 1658.0], [73.2, 1658.0], [73.3, 1658.0], [73.4, 1658.0], [73.5, 1676.0], [73.6, 1676.0], [73.7, 1676.0], [73.8, 1676.0], [73.9, 1676.0], [74.0, 1684.0], [74.1, 1684.0], [74.2, 1684.0], [74.3, 1684.0], [74.4, 1684.0], [74.5, 1689.0], [74.6, 1689.0], [74.7, 1689.0], [74.8, 1689.0], [74.9, 1689.0], [75.0, 1700.0], [75.1, 1700.0], [75.2, 1700.0], [75.3, 1700.0], [75.4, 1700.0], [75.5, 1705.0], [75.6, 1705.0], [75.7, 1705.0], [75.8, 1705.0], [75.9, 1705.0], [76.0, 1719.0], [76.1, 1719.0], [76.2, 1719.0], [76.3, 1719.0], [76.4, 1719.0], [76.5, 1721.0], [76.6, 1721.0], [76.7, 1721.0], [76.8, 1721.0], [76.9, 1721.0], [77.0, 1726.0], [77.1, 1726.0], [77.2, 1726.0], [77.3, 1726.0], [77.4, 1726.0], [77.5, 1727.0], [77.6, 1727.0], [77.7, 1727.0], [77.8, 1727.0], [77.9, 1727.0], [78.0, 1727.0], [78.1, 1727.0], [78.2, 1727.0], [78.3, 1727.0], [78.4, 1727.0], [78.5, 1729.0], [78.6, 1729.0], [78.7, 1729.0], [78.8, 1729.0], [78.9, 1729.0], [79.0, 1729.0], [79.1, 1729.0], [79.2, 1729.0], [79.3, 1729.0], [79.4, 1729.0], [79.5, 1730.0], [79.6, 1730.0], [79.7, 1730.0], [79.8, 1730.0], [79.9, 1730.0], [80.0, 1732.0], [80.1, 1732.0], [80.2, 1732.0], [80.3, 1732.0], [80.4, 1732.0], [80.5, 1733.0], [80.6, 1733.0], [80.7, 1733.0], [80.8, 1733.0], [80.9, 1733.0], [81.0, 1735.0], [81.1, 1735.0], [81.2, 1735.0], [81.3, 1735.0], [81.4, 1735.0], [81.5, 1738.0], [81.6, 1738.0], [81.7, 1738.0], [81.8, 1738.0], [81.9, 1738.0], [82.0, 1741.0], [82.1, 1741.0], [82.2, 1741.0], [82.3, 1741.0], [82.4, 1741.0], [82.5, 1743.0], [82.6, 1743.0], [82.7, 1743.0], [82.8, 1743.0], [82.9, 1743.0], [83.0, 1750.0], [83.1, 1750.0], [83.2, 1750.0], [83.3, 1750.0], [83.4, 1750.0], [83.5, 1757.0], [83.6, 1757.0], [83.7, 1757.0], [83.8, 1757.0], [83.9, 1757.0], [84.0, 1757.0], [84.1, 1757.0], [84.2, 1757.0], [84.3, 1757.0], [84.4, 1757.0], [84.5, 1763.0], [84.6, 1763.0], [84.7, 1763.0], [84.8, 1763.0], [84.9, 1763.0], [85.0, 1764.0], [85.1, 1764.0], [85.2, 1764.0], [85.3, 1764.0], [85.4, 1764.0], [85.5, 1767.0], [85.6, 1767.0], [85.7, 1767.0], [85.8, 1767.0], [85.9, 1767.0], [86.0, 1774.0], [86.1, 1774.0], [86.2, 1774.0], [86.3, 1774.0], [86.4, 1774.0], [86.5, 1775.0], [86.6, 1775.0], [86.7, 1775.0], [86.8, 1775.0], [86.9, 1775.0], [87.0, 1780.0], [87.1, 1780.0], [87.2, 1780.0], [87.3, 1780.0], [87.4, 1780.0], [87.5, 1781.0], [87.6, 1781.0], [87.7, 1781.0], [87.8, 1781.0], [87.9, 1781.0], [88.0, 1781.0], [88.1, 1781.0], [88.2, 1781.0], [88.3, 1781.0], [88.4, 1781.0], [88.5, 1791.0], [88.6, 1791.0], [88.7, 1791.0], [88.8, 1791.0], [88.9, 1791.0], [89.0, 1807.0], [89.1, 1807.0], [89.2, 1807.0], [89.3, 1807.0], [89.4, 1807.0], [89.5, 1812.0], [89.6, 1812.0], [89.7, 1812.0], [89.8, 1812.0], [89.9, 1812.0], [90.0, 1815.0], [90.1, 1815.0], [90.2, 1815.0], [90.3, 1815.0], [90.4, 1815.0], [90.5, 1820.0], [90.6, 1820.0], [90.7, 1820.0], [90.8, 1820.0], [90.9, 1820.0], [91.0, 1821.0], [91.1, 1821.0], [91.2, 1821.0], [91.3, 1821.0], [91.4, 1821.0], [91.5, 1823.0], [91.6, 1823.0], [91.7, 1823.0], [91.8, 1823.0], [91.9, 1823.0], [92.0, 1825.0], [92.1, 1825.0], [92.2, 1825.0], [92.3, 1825.0], [92.4, 1825.0], [92.5, 1825.0], [92.6, 1825.0], [92.7, 1825.0], [92.8, 1825.0], [92.9, 1825.0], [93.0, 1826.0], [93.1, 1826.0], [93.2, 1826.0], [93.3, 1826.0], [93.4, 1826.0], [93.5, 1827.0], [93.6, 1827.0], [93.7, 1827.0], [93.8, 1827.0], [93.9, 1827.0], [94.0, 1829.0], [94.1, 1829.0], [94.2, 1829.0], [94.3, 1829.0], [94.4, 1829.0], [94.5, 1830.0], [94.6, 1830.0], [94.7, 1830.0], [94.8, 1830.0], [94.9, 1830.0], [95.0, 1831.0], [95.1, 1831.0], [95.2, 1831.0], [95.3, 1831.0], [95.4, 1831.0], [95.5, 1833.0], [95.6, 1833.0], [95.7, 1833.0], [95.8, 1833.0], [95.9, 1833.0], [96.0, 1836.0], [96.1, 1836.0], [96.2, 1836.0], [96.3, 1836.0], [96.4, 1836.0], [96.5, 1836.0], [96.6, 1836.0], [96.7, 1836.0], [96.8, 1836.0], [96.9, 1836.0], [97.0, 1839.0], [97.1, 1839.0], [97.2, 1839.0], [97.3, 1839.0], [97.4, 1839.0], [97.5, 1841.0], [97.6, 1841.0], [97.7, 1841.0], [97.8, 1841.0], [97.9, 1841.0], [98.0, 1843.0], [98.1, 1843.0], [98.2, 1843.0], [98.3, 1843.0], [98.4, 1843.0], [98.5, 1843.0], [98.6, 1843.0], [98.7, 1843.0], [98.8, 1843.0], [98.9, 1843.0], [99.0, 1853.0], [99.1, 1853.0], [99.2, 1853.0], [99.3, 1853.0], [99.4, 1853.0], [99.5, 1853.0], [99.6, 1853.0], [99.7, 1853.0], [99.8, 1853.0], [99.9, 1853.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

/**
 * @param elementId Id of element where we display message
 */
function setEmptyGraph(elementId) {
    $(function() {
        $(elementId).text("No graph series with filter="+seriesFilter);
    });
}

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if(infos.data.result.series.length == 0) {
        setEmptyGraph("#bodyResponseTimePercentiles");
        return;
    }
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 600.0, "maxY": 28.0, "series": [{"data": [[1100.0, 21.0], [600.0, 1.0], [1200.0, 23.0], [1300.0, 16.0], [1400.0, 18.0], [1500.0, 23.0], [800.0, 5.0], [1600.0, 13.0], [1700.0, 28.0], [900.0, 15.0], [1800.0, 22.0], [1000.0, 15.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1800.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if(infos.data.result.series.length == 0) {
        setEmptyGraph("#bodyResponseTimeDistribution");
        return;
    }
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 86.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 114.0, "series": [{"data": [], "color": "#9ACD32", "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[1.0, 114.0]], "color": "yellow", "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 86.0]], "color": "orange", "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}, {"data": [], "color": "#FF6347", "isOverall": false, "label": "Requests in error", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 101.27499999999996, "minX": 1.77492756E12, "maxY": 101.27499999999996, "series": [{"data": [[1.77492756E12, 101.27499999999996]], "isOverall": false, "label": "线程组-用户信息-关键接口", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.77492756E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: getTimeFormat(this.data.result.granularity),
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 682.0, "minX": 1.0, "maxY": 1853.0, "series": [{"data": [[2.0, 1727.0], [4.0, 1853.0], [5.0, 1192.0], [7.0, 1773.5], [8.0, 1395.0], [9.0, 1174.0], [12.0, 1405.6666666666667], [13.0, 1443.0], [14.0, 1843.0], [18.0, 1274.25], [24.0, 1625.5], [25.0, 1491.0], [27.0, 1385.5], [28.0, 1684.0], [29.0, 1373.0], [30.0, 1658.0], [33.0, 1128.3333333333333], [34.0, 1366.0], [37.0, 1429.6666666666667], [41.0, 1719.0], [40.0, 1354.0], [43.0, 1589.0], [45.0, 1226.0], [47.0, 1801.5], [49.0, 1137.0], [53.0, 1626.0], [52.0, 1478.6666666666667], [54.0, 1561.0], [61.0, 1478.5714285714287], [63.0, 1568.0], [65.0, 1375.0], [70.0, 1319.5], [68.0, 1230.0], [74.0, 1296.5], [77.0, 1419.0], [76.0, 1448.6666666666667], [83.0, 1826.0], [82.0, 1561.5], [80.0, 1726.0], [87.0, 1660.0], [86.0, 1827.0], [84.0, 1139.0], [91.0, 1618.0], [89.0, 1418.0], [95.0, 1820.0], [94.0, 1292.5], [99.0, 1541.0], [98.0, 1378.0], [96.0, 1428.0], [103.0, 1576.0], [102.0, 1616.5], [106.0, 1781.0], [105.0, 1373.3333333333333], [111.0, 1729.0], [110.0, 1774.0], [109.0, 1747.0], [115.0, 1731.0], [113.0, 1527.0], [112.0, 1812.0], [119.0, 1757.0], [118.0, 1743.0], [117.0, 935.0], [116.0, 1318.0], [122.0, 1366.0], [121.0, 1750.0], [120.0, 987.0], [127.0, 1038.0], [126.0, 1418.5], [124.0, 1337.5], [135.0, 1082.0], [134.0, 1279.0], [133.0, 1396.0], [132.0, 1780.0], [131.0, 911.0], [130.0, 1203.0], [129.0, 1269.0], [128.0, 1250.0], [143.0, 1457.5], [141.0, 1324.25], [137.0, 1676.0], [136.0, 1053.0], [150.0, 1757.0], [149.0, 883.0], [148.0, 1510.0], [144.0, 1206.0], [159.0, 1605.0], [158.0, 1501.0], [157.0, 1412.0], [156.0, 960.0], [154.0, 992.0], [153.0, 1006.0], [152.0, 1514.0], [166.0, 1730.0], [165.0, 1211.0], [164.0, 1149.0], [163.0, 1630.0], [162.0, 1208.0], [160.0, 1225.0], [174.0, 1245.0], [172.0, 1401.0], [171.0, 1505.0], [170.0, 1359.75], [183.0, 1210.0], [182.0, 1721.0], [181.0, 1282.0], [180.0, 1062.0], [179.0, 967.0], [178.0, 850.0], [177.0, 1082.0], [176.0, 1384.0], [191.0, 1076.0], [190.0, 934.0], [189.0, 899.0], [188.0, 929.0], [187.0, 1537.0], [186.0, 1689.0], [185.0, 1251.0], [184.0, 838.0], [199.0, 1372.0], [198.0, 1338.0], [197.0, 1474.0], [196.0, 1471.0], [195.0, 1134.0], [193.0, 1264.0], [192.0, 1266.0], [200.0, 682.0], [1.0, 1596.0]], "isOverall": false, "label": "HTTP请求", "isController": false}, {"data": [[101.26999999999994, 1407.4550000000006]], "isOverall": false, "label": "HTTP请求-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 200.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(infos.data.result.series.length == 0) {
        setEmptyGraph("#bodyTimeVsThreads");
        return;
    }
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 1400.0, "minX": 1.77492756E12, "maxY": 13540.0, "series": [{"data": [[1.77492756E12, 13540.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.77492756E12, 1400.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.77492756E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: getTimeFormat(this.data.result.granularity),
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 1407.4550000000006, "minX": 1.77492756E12, "maxY": 1407.4550000000006, "series": [{"data": [[1.77492756E12, 1407.4550000000006]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.77492756E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: getTimeFormat(this.data.result.granularity),
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(infos.data.result.series.length == 0) {
        setEmptyGraph("#bodyResponseTimeOverTime");
        return;
    }
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 1407.42, "minX": 1.77492756E12, "maxY": 1407.42, "series": [{"data": [[1.77492756E12, 1407.42]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.77492756E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: getTimeFormat(this.data.result.granularity),
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(infos.data.result.series.length == 0) {
        setEmptyGraph("#bodyLatenciesOverTime");
        return;
    }
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 777.4100000000002, "minX": 1.77492756E12, "maxY": 777.4100000000002, "series": [{"data": [[1.77492756E12, 777.4100000000002]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.77492756E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: getTimeFormat(this.data.result.granularity),
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(infos.data.result.series.length == 0) {
        setEmptyGraph("#bodyConnectTimeOverTime");
        return;
    }
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 682.0, "minX": 1.77492756E12, "maxY": 1853.0, "series": [{"data": [[1.77492756E12, 1853.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.77492756E12, 1814.7]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.77492756E12, 1852.9]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.77492756E12, 1830.95]], "isOverall": false, "label": "95th percentile", "isController": false}, {"data": [[1.77492756E12, 682.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.77492756E12, 1412.0]], "isOverall": false, "label": "Median", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.77492756E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: getTimeFormat(this.data.result.granularity),
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 1412.0, "minX": 200.0, "maxY": 1412.0, "series": [{"data": [[200.0, 1412.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 200.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 1412.0, "minX": 200.0, "maxY": 1412.0, "series": [{"data": [[200.0, 1412.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 200.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median Latency time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.77492756E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.77492756E12, 3.3333333333333335]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.77492756E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: getTimeFormat(this.data.result.granularity),
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.77492756E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.77492756E12, 3.3333333333333335]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.77492756E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: getTimeFormat(this.data.result.granularity),
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.77492756E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.77492756E12, 3.3333333333333335]], "isOverall": false, "label": "HTTP请求-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.77492756E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: getTimeFormat(this.data.result.granularity),
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(infos.data.result.series.length == 0) {
        setEmptyGraph("#bodyTransactionsPerSecond");
        return;
    }
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var totalTPSInfos = {
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.77492756E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.77492756E12, 3.3333333333333335]], "isOverall": false, "label": "Transaction-success", "isController": false}, {"data": [], "isOverall": false, "label": "Transaction-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.77492756E12, "title": "Total Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: getTimeFormat(this.data.result.granularity),
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTotalTPS"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                },
                colors: ["#9ACD32", "#FF6347"]
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTotalTPS"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTotalTPS"), dataset, options);
        // setup overview
        $.plot($("#overviewTotalTPS"), dataset, prepareOverviewOptions(options));
    }
};

// Total Transactions per second
function refreshTotalTPS(fixTimestamps) {
    var infos = totalTPSInfos;
    // We want to ignore seriesFilter
    prepareSeries(infos.data, false, true);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotTotalTPS"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTotalTPS");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTotalTPS", "#overviewTotalTPS");
        $('#footerTotalTPS .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyCustomGraph") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCustomGraph(true);
            }
            document.location.href="#responseCustomGraph";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyTotalTPS") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTotalTPS(true);
            }
            document.location.href="#totalTPS";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    }else if(id == "choicesResponseCustomGraph"){
        choiceContainer = $("#choicesResponseCustomGraph");
        refreshCustomGraph(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "choicesResponseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesTotalTPS"){
        choiceContainer = $("#choicesTotalTPS");
        refreshTotalTPS(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    if(choiceContainer != null) {
        choiceContainer.find("label").each(function(){
            this.style.color = color;
        });
    }
}

