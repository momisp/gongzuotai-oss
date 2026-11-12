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
        data: {"result": {"minY": 63.0, "minX": 0.0, "maxY": 656.0, "series": [{"data": [[0.0, 63.0], [0.1, 63.0], [0.2, 63.0], [0.3, 63.0], [0.4, 63.0], [0.5, 63.0], [0.6, 63.0], [0.7, 63.0], [0.8, 63.0], [0.9, 63.0], [1.0, 63.0], [1.1, 63.0], [1.2, 63.0], [1.3, 63.0], [1.4, 63.0], [1.5, 64.0], [1.6, 64.0], [1.7, 64.0], [1.8, 64.0], [1.9, 64.0], [2.0, 64.0], [2.1, 64.0], [2.2, 64.0], [2.3, 64.0], [2.4, 64.0], [2.5, 64.0], [2.6, 64.0], [2.7, 64.0], [2.8, 64.0], [2.9, 64.0], [3.0, 65.0], [3.1, 65.0], [3.2, 65.0], [3.3, 65.0], [3.4, 65.0], [3.5, 65.0], [3.6, 65.0], [3.7, 65.0], [3.8, 65.0], [3.9, 65.0], [4.0, 65.0], [4.1, 65.0], [4.2, 65.0], [4.3, 65.0], [4.4, 65.0], [4.5, 65.0], [4.6, 65.0], [4.7, 65.0], [4.8, 65.0], [4.9, 65.0], [5.0, 66.0], [5.1, 66.0], [5.2, 66.0], [5.3, 66.0], [5.4, 66.0], [5.5, 66.0], [5.6, 66.0], [5.7, 66.0], [5.8, 66.0], [5.9, 66.0], [6.0, 66.0], [6.1, 66.0], [6.2, 66.0], [6.3, 66.0], [6.4, 66.0], [6.5, 66.0], [6.6, 66.0], [6.7, 66.0], [6.8, 66.0], [6.9, 66.0], [7.0, 66.0], [7.1, 66.0], [7.2, 66.0], [7.3, 66.0], [7.4, 66.0], [7.5, 66.0], [7.6, 66.0], [7.7, 66.0], [7.8, 66.0], [7.9, 66.0], [8.0, 66.0], [8.1, 66.0], [8.2, 66.0], [8.3, 66.0], [8.4, 66.0], [8.5, 66.0], [8.6, 66.0], [8.7, 66.0], [8.8, 66.0], [8.9, 66.0], [9.0, 66.0], [9.1, 66.0], [9.2, 66.0], [9.3, 66.0], [9.4, 66.0], [9.5, 66.0], [9.6, 66.0], [9.7, 66.0], [9.8, 66.0], [9.9, 66.0], [10.0, 67.0], [10.1, 67.0], [10.2, 67.0], [10.3, 67.0], [10.4, 67.0], [10.5, 67.0], [10.6, 67.0], [10.7, 67.0], [10.8, 67.0], [10.9, 67.0], [11.0, 67.0], [11.1, 67.0], [11.2, 67.0], [11.3, 67.0], [11.4, 67.0], [11.5, 67.0], [11.6, 67.0], [11.7, 67.0], [11.8, 67.0], [11.9, 67.0], [12.0, 68.0], [12.1, 68.0], [12.2, 68.0], [12.3, 68.0], [12.4, 68.0], [12.5, 69.0], [12.6, 69.0], [12.7, 69.0], [12.8, 69.0], [12.9, 69.0], [13.0, 69.0], [13.1, 69.0], [13.2, 69.0], [13.3, 69.0], [13.4, 69.0], [13.5, 69.0], [13.6, 69.0], [13.7, 69.0], [13.8, 69.0], [13.9, 69.0], [14.0, 69.0], [14.1, 69.0], [14.2, 69.0], [14.3, 69.0], [14.4, 69.0], [14.5, 71.0], [14.6, 71.0], [14.7, 71.0], [14.8, 71.0], [14.9, 71.0], [15.0, 71.0], [15.1, 71.0], [15.2, 71.0], [15.3, 71.0], [15.4, 71.0], [15.5, 71.0], [15.6, 71.0], [15.7, 71.0], [15.8, 71.0], [15.9, 71.0], [16.0, 72.0], [16.1, 72.0], [16.2, 72.0], [16.3, 72.0], [16.4, 72.0], [16.5, 72.0], [16.6, 72.0], [16.7, 72.0], [16.8, 72.0], [16.9, 72.0], [17.0, 72.0], [17.1, 72.0], [17.2, 72.0], [17.3, 72.0], [17.4, 72.0], [17.5, 73.0], [17.6, 73.0], [17.7, 73.0], [17.8, 73.0], [17.9, 73.0], [18.0, 73.0], [18.1, 73.0], [18.2, 73.0], [18.3, 73.0], [18.4, 73.0], [18.5, 73.0], [18.6, 73.0], [18.7, 73.0], [18.8, 73.0], [18.9, 73.0], [19.0, 73.0], [19.1, 73.0], [19.2, 73.0], [19.3, 73.0], [19.4, 73.0], [19.5, 74.0], [19.6, 74.0], [19.7, 74.0], [19.8, 74.0], [19.9, 74.0], [20.0, 74.0], [20.1, 74.0], [20.2, 74.0], [20.3, 74.0], [20.4, 74.0], [20.5, 74.0], [20.6, 74.0], [20.7, 74.0], [20.8, 74.0], [20.9, 74.0], [21.0, 74.0], [21.1, 74.0], [21.2, 74.0], [21.3, 74.0], [21.4, 74.0], [21.5, 74.0], [21.6, 74.0], [21.7, 74.0], [21.8, 74.0], [21.9, 74.0], [22.0, 74.0], [22.1, 74.0], [22.2, 74.0], [22.3, 74.0], [22.4, 74.0], [22.5, 74.0], [22.6, 74.0], [22.7, 74.0], [22.8, 74.0], [22.9, 74.0], [23.0, 75.0], [23.1, 75.0], [23.2, 75.0], [23.3, 75.0], [23.4, 75.0], [23.5, 77.0], [23.6, 77.0], [23.7, 77.0], [23.8, 77.0], [23.9, 77.0], [24.0, 79.0], [24.1, 79.0], [24.2, 79.0], [24.3, 79.0], [24.4, 79.0], [24.5, 80.0], [24.6, 80.0], [24.7, 80.0], [24.8, 80.0], [24.9, 80.0], [25.0, 80.0], [25.1, 80.0], [25.2, 80.0], [25.3, 80.0], [25.4, 80.0], [25.5, 80.0], [25.6, 80.0], [25.7, 80.0], [25.8, 80.0], [25.9, 80.0], [26.0, 80.0], [26.1, 80.0], [26.2, 80.0], [26.3, 80.0], [26.4, 80.0], [26.5, 82.0], [26.6, 82.0], [26.7, 82.0], [26.8, 82.0], [26.9, 82.0], [27.0, 83.0], [27.1, 83.0], [27.2, 83.0], [27.3, 83.0], [27.4, 83.0], [27.5, 84.0], [27.6, 84.0], [27.7, 84.0], [27.8, 84.0], [27.9, 84.0], [28.0, 84.0], [28.1, 84.0], [28.2, 84.0], [28.3, 84.0], [28.4, 84.0], [28.5, 85.0], [28.6, 85.0], [28.7, 85.0], [28.8, 85.0], [28.9, 85.0], [29.0, 86.0], [29.1, 86.0], [29.2, 86.0], [29.3, 86.0], [29.4, 86.0], [29.5, 86.0], [29.6, 86.0], [29.7, 86.0], [29.8, 86.0], [29.9, 86.0], [30.0, 87.0], [30.1, 87.0], [30.2, 87.0], [30.3, 87.0], [30.4, 87.0], [30.5, 87.0], [30.6, 87.0], [30.7, 87.0], [30.8, 87.0], [30.9, 87.0], [31.0, 88.0], [31.1, 88.0], [31.2, 88.0], [31.3, 88.0], [31.4, 88.0], [31.5, 88.0], [31.6, 88.0], [31.7, 88.0], [31.8, 88.0], [31.9, 88.0], [32.0, 89.0], [32.1, 89.0], [32.2, 89.0], [32.3, 89.0], [32.4, 89.0], [32.5, 89.0], [32.6, 89.0], [32.7, 89.0], [32.8, 89.0], [32.9, 89.0], [33.0, 90.0], [33.1, 90.0], [33.2, 90.0], [33.3, 90.0], [33.4, 90.0], [33.5, 90.0], [33.6, 90.0], [33.7, 90.0], [33.8, 90.0], [33.9, 90.0], [34.0, 92.0], [34.1, 92.0], [34.2, 92.0], [34.3, 92.0], [34.4, 92.0], [34.5, 92.0], [34.6, 92.0], [34.7, 92.0], [34.8, 92.0], [34.9, 92.0], [35.0, 92.0], [35.1, 92.0], [35.2, 92.0], [35.3, 92.0], [35.4, 92.0], [35.5, 93.0], [35.6, 93.0], [35.7, 93.0], [35.8, 93.0], [35.9, 93.0], [36.0, 93.0], [36.1, 93.0], [36.2, 93.0], [36.3, 93.0], [36.4, 93.0], [36.5, 95.0], [36.6, 95.0], [36.7, 95.0], [36.8, 95.0], [36.9, 95.0], [37.0, 95.0], [37.1, 95.0], [37.2, 95.0], [37.3, 95.0], [37.4, 95.0], [37.5, 95.0], [37.6, 95.0], [37.7, 95.0], [37.8, 95.0], [37.9, 95.0], [38.0, 95.0], [38.1, 95.0], [38.2, 95.0], [38.3, 95.0], [38.4, 95.0], [38.5, 96.0], [38.6, 96.0], [38.7, 96.0], [38.8, 96.0], [38.9, 96.0], [39.0, 96.0], [39.1, 96.0], [39.2, 96.0], [39.3, 96.0], [39.4, 96.0], [39.5, 97.0], [39.6, 97.0], [39.7, 97.0], [39.8, 97.0], [39.9, 97.0], [40.0, 97.0], [40.1, 97.0], [40.2, 97.0], [40.3, 97.0], [40.4, 97.0], [40.5, 98.0], [40.6, 98.0], [40.7, 98.0], [40.8, 98.0], [40.9, 98.0], [41.0, 98.0], [41.1, 98.0], [41.2, 98.0], [41.3, 98.0], [41.4, 98.0], [41.5, 98.0], [41.6, 98.0], [41.7, 98.0], [41.8, 98.0], [41.9, 98.0], [42.0, 99.0], [42.1, 99.0], [42.2, 99.0], [42.3, 99.0], [42.4, 99.0], [42.5, 99.0], [42.6, 99.0], [42.7, 99.0], [42.8, 99.0], [42.9, 99.0], [43.0, 100.0], [43.1, 100.0], [43.2, 100.0], [43.3, 100.0], [43.4, 100.0], [43.5, 100.0], [43.6, 100.0], [43.7, 100.0], [43.8, 100.0], [43.9, 100.0], [44.0, 102.0], [44.1, 102.0], [44.2, 102.0], [44.3, 102.0], [44.4, 102.0], [44.5, 102.0], [44.6, 102.0], [44.7, 102.0], [44.8, 102.0], [44.9, 102.0], [45.0, 103.0], [45.1, 103.0], [45.2, 103.0], [45.3, 103.0], [45.4, 103.0], [45.5, 103.0], [45.6, 103.0], [45.7, 103.0], [45.8, 103.0], [45.9, 103.0], [46.0, 104.0], [46.1, 104.0], [46.2, 104.0], [46.3, 104.0], [46.4, 104.0], [46.5, 108.0], [46.6, 108.0], [46.7, 108.0], [46.8, 108.0], [46.9, 108.0], [47.0, 116.0], [47.1, 116.0], [47.2, 116.0], [47.3, 116.0], [47.4, 116.0], [47.5, 168.0], [47.6, 168.0], [47.7, 168.0], [47.8, 168.0], [47.9, 168.0], [48.0, 171.0], [48.1, 171.0], [48.2, 171.0], [48.3, 171.0], [48.4, 171.0], [48.5, 178.0], [48.6, 178.0], [48.7, 178.0], [48.8, 178.0], [48.9, 178.0], [49.0, 178.0], [49.1, 178.0], [49.2, 178.0], [49.3, 178.0], [49.4, 178.0], [49.5, 180.0], [49.6, 180.0], [49.7, 180.0], [49.8, 180.0], [49.9, 180.0], [50.0, 184.0], [50.1, 184.0], [50.2, 184.0], [50.3, 184.0], [50.4, 184.0], [50.5, 195.0], [50.6, 195.0], [50.7, 195.0], [50.8, 195.0], [50.9, 195.0], [51.0, 195.0], [51.1, 195.0], [51.2, 195.0], [51.3, 195.0], [51.4, 195.0], [51.5, 197.0], [51.6, 197.0], [51.7, 197.0], [51.8, 197.0], [51.9, 197.0], [52.0, 197.0], [52.1, 197.0], [52.2, 197.0], [52.3, 197.0], [52.4, 197.0], [52.5, 199.0], [52.6, 199.0], [52.7, 199.0], [52.8, 199.0], [52.9, 199.0], [53.0, 200.0], [53.1, 200.0], [53.2, 200.0], [53.3, 200.0], [53.4, 200.0], [53.5, 200.0], [53.6, 200.0], [53.7, 200.0], [53.8, 200.0], [53.9, 200.0], [54.0, 201.0], [54.1, 201.0], [54.2, 201.0], [54.3, 201.0], [54.4, 201.0], [54.5, 212.0], [54.6, 212.0], [54.7, 212.0], [54.8, 212.0], [54.9, 212.0], [55.0, 215.0], [55.1, 215.0], [55.2, 215.0], [55.3, 215.0], [55.4, 215.0], [55.5, 216.0], [55.6, 216.0], [55.7, 216.0], [55.8, 216.0], [55.9, 216.0], [56.0, 217.0], [56.1, 217.0], [56.2, 217.0], [56.3, 217.0], [56.4, 217.0], [56.5, 217.0], [56.6, 217.0], [56.7, 217.0], [56.8, 217.0], [56.9, 217.0], [57.0, 218.0], [57.1, 218.0], [57.2, 218.0], [57.3, 218.0], [57.4, 218.0], [57.5, 220.0], [57.6, 220.0], [57.7, 220.0], [57.8, 220.0], [57.9, 220.0], [58.0, 222.0], [58.1, 222.0], [58.2, 222.0], [58.3, 222.0], [58.4, 222.0], [58.5, 224.0], [58.6, 224.0], [58.7, 224.0], [58.8, 224.0], [58.9, 224.0], [59.0, 242.0], [59.1, 242.0], [59.2, 242.0], [59.3, 242.0], [59.4, 242.0], [59.5, 243.0], [59.6, 243.0], [59.7, 243.0], [59.8, 243.0], [59.9, 243.0], [60.0, 252.0], [60.1, 252.0], [60.2, 252.0], [60.3, 252.0], [60.4, 252.0], [60.5, 268.0], [60.6, 268.0], [60.7, 268.0], [60.8, 268.0], [60.9, 268.0], [61.0, 270.0], [61.1, 270.0], [61.2, 270.0], [61.3, 270.0], [61.4, 270.0], [61.5, 281.0], [61.6, 281.0], [61.7, 281.0], [61.8, 281.0], [61.9, 281.0], [62.0, 281.0], [62.1, 281.0], [62.2, 281.0], [62.3, 281.0], [62.4, 281.0], [62.5, 288.0], [62.6, 288.0], [62.7, 288.0], [62.8, 288.0], [62.9, 288.0], [63.0, 290.0], [63.1, 290.0], [63.2, 290.0], [63.3, 290.0], [63.4, 290.0], [63.5, 310.0], [63.6, 310.0], [63.7, 310.0], [63.8, 310.0], [63.9, 310.0], [64.0, 314.0], [64.1, 314.0], [64.2, 314.0], [64.3, 314.0], [64.4, 314.0], [64.5, 348.0], [64.6, 348.0], [64.7, 348.0], [64.8, 348.0], [64.9, 348.0], [65.0, 352.0], [65.1, 352.0], [65.2, 352.0], [65.3, 352.0], [65.4, 352.0], [65.5, 354.0], [65.6, 354.0], [65.7, 354.0], [65.8, 354.0], [65.9, 354.0], [66.0, 360.0], [66.1, 360.0], [66.2, 360.0], [66.3, 360.0], [66.4, 360.0], [66.5, 362.0], [66.6, 362.0], [66.7, 362.0], [66.8, 362.0], [66.9, 362.0], [67.0, 369.0], [67.1, 369.0], [67.2, 369.0], [67.3, 369.0], [67.4, 369.0], [67.5, 369.0], [67.6, 369.0], [67.7, 369.0], [67.8, 369.0], [67.9, 369.0], [68.0, 377.0], [68.1, 377.0], [68.2, 377.0], [68.3, 377.0], [68.4, 377.0], [68.5, 387.0], [68.6, 387.0], [68.7, 387.0], [68.8, 387.0], [68.9, 387.0], [69.0, 389.0], [69.1, 389.0], [69.2, 389.0], [69.3, 389.0], [69.4, 389.0], [69.5, 392.0], [69.6, 392.0], [69.7, 392.0], [69.8, 392.0], [69.9, 392.0], [70.0, 400.0], [70.1, 400.0], [70.2, 400.0], [70.3, 400.0], [70.4, 400.0], [70.5, 404.0], [70.6, 404.0], [70.7, 404.0], [70.8, 404.0], [70.9, 404.0], [71.0, 407.0], [71.1, 407.0], [71.2, 407.0], [71.3, 407.0], [71.4, 407.0], [71.5, 414.0], [71.6, 414.0], [71.7, 414.0], [71.8, 414.0], [71.9, 414.0], [72.0, 418.0], [72.1, 418.0], [72.2, 418.0], [72.3, 418.0], [72.4, 418.0], [72.5, 439.0], [72.6, 439.0], [72.7, 439.0], [72.8, 439.0], [72.9, 439.0], [73.0, 445.0], [73.1, 445.0], [73.2, 445.0], [73.3, 445.0], [73.4, 445.0], [73.5, 462.0], [73.6, 462.0], [73.7, 462.0], [73.8, 462.0], [73.9, 462.0], [74.0, 463.0], [74.1, 463.0], [74.2, 463.0], [74.3, 463.0], [74.4, 463.0], [74.5, 466.0], [74.6, 466.0], [74.7, 466.0], [74.8, 466.0], [74.9, 466.0], [75.0, 472.0], [75.1, 472.0], [75.2, 472.0], [75.3, 472.0], [75.4, 472.0], [75.5, 478.0], [75.6, 478.0], [75.7, 478.0], [75.8, 478.0], [75.9, 478.0], [76.0, 480.0], [76.1, 480.0], [76.2, 480.0], [76.3, 480.0], [76.4, 480.0], [76.5, 481.0], [76.6, 481.0], [76.7, 481.0], [76.8, 481.0], [76.9, 481.0], [77.0, 483.0], [77.1, 483.0], [77.2, 483.0], [77.3, 483.0], [77.4, 483.0], [77.5, 483.0], [77.6, 483.0], [77.7, 483.0], [77.8, 483.0], [77.9, 483.0], [78.0, 487.0], [78.1, 487.0], [78.2, 487.0], [78.3, 487.0], [78.4, 487.0], [78.5, 489.0], [78.6, 489.0], [78.7, 489.0], [78.8, 489.0], [78.9, 489.0], [79.0, 493.0], [79.1, 493.0], [79.2, 493.0], [79.3, 493.0], [79.4, 493.0], [79.5, 494.0], [79.6, 494.0], [79.7, 494.0], [79.8, 494.0], [79.9, 494.0], [80.0, 502.0], [80.1, 502.0], [80.2, 502.0], [80.3, 502.0], [80.4, 502.0], [80.5, 507.0], [80.6, 507.0], [80.7, 507.0], [80.8, 507.0], [80.9, 507.0], [81.0, 510.0], [81.1, 510.0], [81.2, 510.0], [81.3, 510.0], [81.4, 510.0], [81.5, 512.0], [81.6, 512.0], [81.7, 512.0], [81.8, 512.0], [81.9, 512.0], [82.0, 515.0], [82.1, 515.0], [82.2, 515.0], [82.3, 515.0], [82.4, 515.0], [82.5, 523.0], [82.6, 523.0], [82.7, 523.0], [82.8, 523.0], [82.9, 523.0], [83.0, 524.0], [83.1, 524.0], [83.2, 524.0], [83.3, 524.0], [83.4, 524.0], [83.5, 532.0], [83.6, 532.0], [83.7, 532.0], [83.8, 532.0], [83.9, 532.0], [84.0, 532.0], [84.1, 532.0], [84.2, 532.0], [84.3, 532.0], [84.4, 532.0], [84.5, 534.0], [84.6, 534.0], [84.7, 534.0], [84.8, 534.0], [84.9, 534.0], [85.0, 537.0], [85.1, 537.0], [85.2, 537.0], [85.3, 537.0], [85.4, 537.0], [85.5, 542.0], [85.6, 542.0], [85.7, 542.0], [85.8, 542.0], [85.9, 542.0], [86.0, 552.0], [86.1, 552.0], [86.2, 552.0], [86.3, 552.0], [86.4, 552.0], [86.5, 562.0], [86.6, 562.0], [86.7, 562.0], [86.8, 562.0], [86.9, 562.0], [87.0, 569.0], [87.1, 569.0], [87.2, 569.0], [87.3, 569.0], [87.4, 569.0], [87.5, 584.0], [87.6, 584.0], [87.7, 584.0], [87.8, 584.0], [87.9, 584.0], [88.0, 586.0], [88.1, 586.0], [88.2, 586.0], [88.3, 586.0], [88.4, 586.0], [88.5, 586.0], [88.6, 586.0], [88.7, 586.0], [88.8, 586.0], [88.9, 586.0], [89.0, 598.0], [89.1, 598.0], [89.2, 598.0], [89.3, 598.0], [89.4, 598.0], [89.5, 598.0], [89.6, 598.0], [89.7, 598.0], [89.8, 598.0], [89.9, 598.0], [90.0, 599.0], [90.1, 599.0], [90.2, 599.0], [90.3, 599.0], [90.4, 599.0], [90.5, 599.0], [90.6, 599.0], [90.7, 599.0], [90.8, 599.0], [90.9, 599.0], [91.0, 602.0], [91.1, 602.0], [91.2, 602.0], [91.3, 602.0], [91.4, 602.0], [91.5, 603.0], [91.6, 603.0], [91.7, 603.0], [91.8, 603.0], [91.9, 603.0], [92.0, 603.0], [92.1, 603.0], [92.2, 603.0], [92.3, 603.0], [92.4, 603.0], [92.5, 607.0], [92.6, 607.0], [92.7, 607.0], [92.8, 607.0], [92.9, 607.0], [93.0, 608.0], [93.1, 608.0], [93.2, 608.0], [93.3, 608.0], [93.4, 608.0], [93.5, 608.0], [93.6, 608.0], [93.7, 608.0], [93.8, 608.0], [93.9, 608.0], [94.0, 611.0], [94.1, 611.0], [94.2, 611.0], [94.3, 611.0], [94.4, 611.0], [94.5, 615.0], [94.6, 615.0], [94.7, 615.0], [94.8, 615.0], [94.9, 615.0], [95.0, 616.0], [95.1, 616.0], [95.2, 616.0], [95.3, 616.0], [95.4, 616.0], [95.5, 617.0], [95.6, 617.0], [95.7, 617.0], [95.8, 617.0], [95.9, 617.0], [96.0, 618.0], [96.1, 618.0], [96.2, 618.0], [96.3, 618.0], [96.4, 618.0], [96.5, 619.0], [96.6, 619.0], [96.7, 619.0], [96.8, 619.0], [96.9, 619.0], [97.0, 620.0], [97.1, 620.0], [97.2, 620.0], [97.3, 620.0], [97.4, 620.0], [97.5, 623.0], [97.6, 623.0], [97.7, 623.0], [97.8, 623.0], [97.9, 623.0], [98.0, 623.0], [98.1, 623.0], [98.2, 623.0], [98.3, 623.0], [98.4, 623.0], [98.5, 625.0], [98.6, 625.0], [98.7, 625.0], [98.8, 625.0], [98.9, 625.0], [99.0, 630.0], [99.1, 630.0], [99.2, 630.0], [99.3, 630.0], [99.4, 630.0], [99.5, 656.0], [99.6, 656.0], [99.7, 656.0], [99.8, 656.0], [99.9, 656.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 13.0, "minX": 0.0, "maxY": 86.0, "series": [{"data": [[0.0, 86.0], [300.0, 13.0], [600.0, 18.0], [100.0, 20.0], [200.0, 21.0], [400.0, 20.0], [500.0, 22.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 600.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 40.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 160.0, "series": [{"data": [[0.0, 160.0]], "color": "#9ACD32", "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[1.0, 40.0]], "color": "yellow", "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [], "color": "orange", "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}, {"data": [], "color": "#FF6347", "isOverall": false, "label": "Requests in error", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 63.15499999999995, "minX": 1.7698407E12, "maxY": 63.15499999999995, "series": [{"data": [[1.7698407E12, 63.15499999999995]], "isOverall": false, "label": "线程组-获取宝箱点位列表-关键接口", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7698407E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 65.0, "minX": 1.0, "maxY": 625.0, "series": [{"data": [[2.0, 65.0], [3.0, 65.0], [4.0, 74.0], [5.0, 67.0], [6.0, 73.0], [7.0, 66.0], [8.0, 66.0], [10.0, 71.5], [11.0, 74.0], [12.0, 66.0], [13.0, 68.66666666666667], [14.0, 67.73333333333333], [15.0, 71.66666666666667], [16.0, 72.83333333333333], [17.0, 82.0], [18.0, 85.0], [20.0, 90.75], [21.0, 92.71428571428571], [22.0, 97.0], [23.0, 267.3333333333333], [25.0, 103.0], [27.0, 487.0], [29.0, 322.75], [31.0, 357.5], [35.0, 414.0], [34.0, 479.6666666666667], [37.0, 93.0], [36.0, 379.5], [39.0, 483.0], [38.0, 343.5], [41.0, 615.0], [40.0, 90.0], [42.0, 183.5], [43.0, 289.5], [44.0, 421.0], [47.0, 207.25], [49.0, 625.0], [48.0, 222.0], [50.0, 623.0], [53.0, 466.0], [52.0, 233.5], [54.0, 619.5], [57.0, 454.75], [56.0, 565.0], [58.0, 532.0], [66.0, 462.0], [70.0, 200.0], [75.0, 603.0], [73.0, 217.25], [77.0, 481.0], [83.0, 404.0], [82.0, 510.0], [87.0, 352.0], [84.0, 569.0], [88.0, 524.0], [93.0, 146.0], [98.0, 116.0], [103.0, 362.0], [101.0, 500.0], [106.0, 545.5], [109.0, 515.0], [108.0, 454.66666666666663], [115.0, 489.0], [114.0, 444.0], [113.0, 466.5], [118.0, 218.0], [123.0, 390.5], [120.0, 288.0], [124.0, 400.0], [133.0, 100.0], [132.0, 151.5], [130.0, 602.0], [137.0, 330.02439024390253], [1.0, 71.0]], "isOverall": false, "label": "HTTP请求", "isController": false}, {"data": [[63.15499999999995, 258.63000000000005]], "isOverall": false, "label": "HTTP请求-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 137.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1440.0, "minX": 1.7698407E12, "maxY": 3293.3333333333335, "series": [{"data": [[1.7698407E12, 3293.3333333333335]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.7698407E12, 1440.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7698407E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 258.63000000000005, "minX": 1.7698407E12, "maxY": 258.63000000000005, "series": [{"data": [[1.7698407E12, 258.63000000000005]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7698407E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 256.76999999999987, "minX": 1.7698407E12, "maxY": 256.76999999999987, "series": [{"data": [[1.7698407E12, 256.76999999999987]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7698407E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 224.79999999999995, "minX": 1.7698407E12, "maxY": 224.79999999999995, "series": [{"data": [[1.7698407E12, 224.79999999999995]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7698407E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 63.0, "minX": 1.7698407E12, "maxY": 656.0, "series": [{"data": [[1.7698407E12, 656.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.7698407E12, 598.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.7698407E12, 629.95]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.7698407E12, 615.95]], "isOverall": false, "label": "95th percentile", "isController": false}, {"data": [[1.7698407E12, 63.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.7698407E12, 182.0]], "isOverall": false, "label": "Median", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7698407E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 74.0, "minX": 89.0, "maxY": 377.0, "series": [{"data": [[89.0, 74.0], [111.0, 377.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 111.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 74.0, "minX": 89.0, "maxY": 370.0, "series": [{"data": [[89.0, 74.0], [111.0, 370.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 111.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.7698407E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.7698407E12, 3.3333333333333335]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7698407E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.7698407E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.7698407E12, 3.3333333333333335]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7698407E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.7698407E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.7698407E12, 3.3333333333333335]], "isOverall": false, "label": "HTTP请求-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7698407E12, "title": "Transactions Per Second"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.7698407E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.7698407E12, 3.3333333333333335]], "isOverall": false, "label": "Transaction-success", "isController": false}, {"data": [], "isOverall": false, "label": "Transaction-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7698407E12, "title": "Total Transactions Per Second"}},
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

