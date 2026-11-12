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
        data: {"result": {"minY": 61.0, "minX": 0.0, "maxY": 660.0, "series": [{"data": [[0.0, 61.0], [0.1, 61.0], [0.2, 61.0], [0.3, 61.0], [0.4, 61.0], [0.5, 61.0], [0.6, 61.0], [0.7, 61.0], [0.8, 63.0], [0.9, 63.0], [1.0, 63.0], [1.1, 63.0], [1.2, 63.0], [1.3, 63.0], [1.4, 63.0], [1.5, 63.0], [1.6, 63.0], [1.7, 63.0], [1.8, 63.0], [1.9, 63.0], [2.0, 63.0], [2.1, 63.0], [2.2, 63.0], [2.3, 64.0], [2.4, 64.0], [2.5, 64.0], [2.6, 64.0], [2.7, 64.0], [2.8, 64.0], [2.9, 64.0], [3.0, 64.0], [3.1, 64.0], [3.2, 64.0], [3.3, 64.0], [3.4, 64.0], [3.5, 64.0], [3.6, 64.0], [3.7, 64.0], [3.8, 65.0], [3.9, 65.0], [4.0, 65.0], [4.1, 65.0], [4.2, 65.0], [4.3, 65.0], [4.4, 65.0], [4.5, 65.0], [4.6, 65.0], [4.7, 65.0], [4.8, 65.0], [4.9, 65.0], [5.0, 65.0], [5.1, 65.0], [5.2, 65.0], [5.3, 65.0], [5.4, 66.0], [5.5, 66.0], [5.6, 66.0], [5.7, 66.0], [5.8, 66.0], [5.9, 66.0], [6.0, 66.0], [6.1, 66.0], [6.2, 66.0], [6.3, 66.0], [6.4, 66.0], [6.5, 66.0], [6.6, 66.0], [6.7, 66.0], [6.8, 66.0], [6.9, 66.0], [7.0, 66.0], [7.1, 66.0], [7.2, 66.0], [7.3, 66.0], [7.4, 66.0], [7.5, 66.0], [7.6, 66.0], [7.7, 66.0], [7.8, 66.0], [7.9, 66.0], [8.0, 66.0], [8.1, 66.0], [8.2, 66.0], [8.3, 66.0], [8.4, 67.0], [8.5, 67.0], [8.6, 67.0], [8.7, 67.0], [8.8, 67.0], [8.9, 67.0], [9.0, 67.0], [9.1, 67.0], [9.2, 67.0], [9.3, 67.0], [9.4, 67.0], [9.5, 67.0], [9.6, 67.0], [9.7, 67.0], [9.8, 67.0], [9.9, 67.0], [10.0, 67.0], [10.1, 67.0], [10.2, 67.0], [10.3, 67.0], [10.4, 67.0], [10.5, 67.0], [10.6, 67.0], [10.7, 67.0], [10.8, 67.0], [10.9, 67.0], [11.0, 67.0], [11.1, 67.0], [11.2, 67.0], [11.3, 67.0], [11.4, 67.0], [11.5, 67.0], [11.6, 67.0], [11.7, 67.0], [11.8, 67.0], [11.9, 67.0], [12.0, 67.0], [12.1, 67.0], [12.2, 67.0], [12.3, 67.0], [12.4, 67.0], [12.5, 67.0], [12.6, 67.0], [12.7, 67.0], [12.8, 67.0], [12.9, 68.0], [13.0, 68.0], [13.1, 68.0], [13.2, 68.0], [13.3, 68.0], [13.4, 68.0], [13.5, 68.0], [13.6, 68.0], [13.7, 68.0], [13.8, 68.0], [13.9, 68.0], [14.0, 68.0], [14.1, 68.0], [14.2, 68.0], [14.3, 68.0], [14.4, 68.0], [14.5, 68.0], [14.6, 68.0], [14.7, 68.0], [14.8, 68.0], [14.9, 68.0], [15.0, 68.0], [15.1, 68.0], [15.2, 68.0], [15.3, 68.0], [15.4, 68.0], [15.5, 68.0], [15.6, 68.0], [15.7, 68.0], [15.8, 68.0], [15.9, 68.0], [16.0, 68.0], [16.1, 68.0], [16.2, 68.0], [16.3, 68.0], [16.4, 68.0], [16.5, 68.0], [16.6, 68.0], [16.7, 70.0], [16.8, 70.0], [16.9, 70.0], [17.0, 70.0], [17.1, 70.0], [17.2, 70.0], [17.3, 70.0], [17.4, 70.0], [17.5, 70.0], [17.6, 70.0], [17.7, 70.0], [17.8, 70.0], [17.9, 70.0], [18.0, 70.0], [18.1, 70.0], [18.2, 70.0], [18.3, 70.0], [18.4, 70.0], [18.5, 70.0], [18.6, 70.0], [18.7, 70.0], [18.8, 70.0], [18.9, 70.0], [19.0, 70.0], [19.1, 70.0], [19.2, 70.0], [19.3, 70.0], [19.4, 70.0], [19.5, 70.0], [19.6, 70.0], [19.7, 70.0], [19.8, 70.0], [19.9, 70.0], [20.0, 70.0], [20.1, 70.0], [20.2, 70.0], [20.3, 70.0], [20.4, 70.0], [20.5, 72.0], [20.6, 72.0], [20.7, 72.0], [20.8, 72.0], [20.9, 72.0], [21.0, 72.0], [21.1, 72.0], [21.2, 72.0], [21.3, 72.0], [21.4, 72.0], [21.5, 72.0], [21.6, 72.0], [21.7, 72.0], [21.8, 72.0], [21.9, 72.0], [22.0, 73.0], [22.1, 73.0], [22.2, 73.0], [22.3, 73.0], [22.4, 73.0], [22.5, 73.0], [22.6, 73.0], [22.7, 73.0], [22.8, 73.0], [22.9, 73.0], [23.0, 73.0], [23.1, 73.0], [23.2, 73.0], [23.3, 73.0], [23.4, 73.0], [23.5, 73.0], [23.6, 73.0], [23.7, 73.0], [23.8, 73.0], [23.9, 73.0], [24.0, 73.0], [24.1, 73.0], [24.2, 73.0], [24.3, 75.0], [24.4, 75.0], [24.5, 75.0], [24.6, 75.0], [24.7, 75.0], [24.8, 75.0], [24.9, 75.0], [25.0, 75.0], [25.1, 75.0], [25.2, 75.0], [25.3, 75.0], [25.4, 75.0], [25.5, 75.0], [25.6, 75.0], [25.7, 75.0], [25.8, 75.0], [25.9, 75.0], [26.0, 75.0], [26.1, 75.0], [26.2, 75.0], [26.3, 75.0], [26.4, 75.0], [26.5, 75.0], [26.6, 76.0], [26.7, 76.0], [26.8, 76.0], [26.9, 76.0], [27.0, 76.0], [27.1, 76.0], [27.2, 76.0], [27.3, 78.0], [27.4, 78.0], [27.5, 78.0], [27.6, 78.0], [27.7, 78.0], [27.8, 78.0], [27.9, 78.0], [28.0, 78.0], [28.1, 78.0], [28.2, 78.0], [28.3, 78.0], [28.4, 78.0], [28.5, 78.0], [28.6, 78.0], [28.7, 78.0], [28.8, 79.0], [28.9, 79.0], [29.0, 79.0], [29.1, 79.0], [29.2, 79.0], [29.3, 79.0], [29.4, 79.0], [29.5, 79.0], [29.6, 81.0], [29.7, 81.0], [29.8, 81.0], [29.9, 81.0], [30.0, 81.0], [30.1, 81.0], [30.2, 81.0], [30.3, 81.0], [30.4, 81.0], [30.5, 81.0], [30.6, 81.0], [30.7, 81.0], [30.8, 81.0], [30.9, 81.0], [31.0, 81.0], [31.1, 82.0], [31.2, 82.0], [31.3, 82.0], [31.4, 82.0], [31.5, 82.0], [31.6, 82.0], [31.7, 82.0], [31.8, 82.0], [31.9, 82.0], [32.0, 82.0], [32.1, 82.0], [32.2, 82.0], [32.3, 82.0], [32.4, 82.0], [32.5, 82.0], [32.6, 83.0], [32.7, 83.0], [32.8, 83.0], [32.9, 83.0], [33.0, 83.0], [33.1, 83.0], [33.2, 83.0], [33.3, 83.0], [33.4, 84.0], [33.5, 84.0], [33.6, 84.0], [33.7, 84.0], [33.8, 84.0], [33.9, 84.0], [34.0, 84.0], [34.1, 86.0], [34.2, 86.0], [34.3, 86.0], [34.4, 86.0], [34.5, 86.0], [34.6, 86.0], [34.7, 86.0], [34.8, 86.0], [34.9, 86.0], [35.0, 86.0], [35.1, 86.0], [35.2, 86.0], [35.3, 86.0], [35.4, 86.0], [35.5, 86.0], [35.6, 86.0], [35.7, 86.0], [35.8, 86.0], [35.9, 86.0], [36.0, 86.0], [36.1, 86.0], [36.2, 86.0], [36.3, 86.0], [36.4, 88.0], [36.5, 88.0], [36.6, 88.0], [36.7, 88.0], [36.8, 88.0], [36.9, 88.0], [37.0, 88.0], [37.1, 88.0], [37.2, 89.0], [37.3, 89.0], [37.4, 89.0], [37.5, 89.0], [37.6, 89.0], [37.7, 89.0], [37.8, 89.0], [37.9, 91.0], [38.0, 91.0], [38.1, 91.0], [38.2, 91.0], [38.3, 91.0], [38.4, 91.0], [38.5, 91.0], [38.6, 91.0], [38.7, 107.0], [38.8, 107.0], [38.9, 107.0], [39.0, 107.0], [39.1, 107.0], [39.2, 107.0], [39.3, 107.0], [39.4, 125.0], [39.5, 125.0], [39.6, 125.0], [39.7, 125.0], [39.8, 125.0], [39.9, 125.0], [40.0, 125.0], [40.1, 125.0], [40.2, 126.0], [40.3, 126.0], [40.4, 126.0], [40.5, 126.0], [40.6, 126.0], [40.7, 126.0], [40.8, 126.0], [40.9, 126.0], [41.0, 134.0], [41.1, 134.0], [41.2, 134.0], [41.3, 134.0], [41.4, 134.0], [41.5, 134.0], [41.6, 134.0], [41.7, 135.0], [41.8, 135.0], [41.9, 135.0], [42.0, 135.0], [42.1, 135.0], [42.2, 135.0], [42.3, 135.0], [42.4, 135.0], [42.5, 136.0], [42.6, 136.0], [42.7, 136.0], [42.8, 136.0], [42.9, 136.0], [43.0, 136.0], [43.1, 136.0], [43.2, 137.0], [43.3, 137.0], [43.4, 137.0], [43.5, 137.0], [43.6, 137.0], [43.7, 137.0], [43.8, 137.0], [43.9, 137.0], [44.0, 139.0], [44.1, 139.0], [44.2, 139.0], [44.3, 139.0], [44.4, 139.0], [44.5, 139.0], [44.6, 139.0], [44.7, 140.0], [44.8, 140.0], [44.9, 140.0], [45.0, 140.0], [45.1, 140.0], [45.2, 140.0], [45.3, 140.0], [45.4, 140.0], [45.5, 143.0], [45.6, 143.0], [45.7, 143.0], [45.8, 143.0], [45.9, 143.0], [46.0, 143.0], [46.1, 143.0], [46.2, 143.0], [46.3, 147.0], [46.4, 147.0], [46.5, 147.0], [46.6, 147.0], [46.7, 147.0], [46.8, 147.0], [46.9, 147.0], [47.0, 148.0], [47.1, 148.0], [47.2, 148.0], [47.3, 148.0], [47.4, 148.0], [47.5, 148.0], [47.6, 148.0], [47.7, 148.0], [47.8, 149.0], [47.9, 149.0], [48.0, 149.0], [48.1, 149.0], [48.2, 149.0], [48.3, 149.0], [48.4, 149.0], [48.5, 149.0], [48.6, 149.0], [48.7, 149.0], [48.8, 149.0], [48.9, 149.0], [49.0, 149.0], [49.1, 149.0], [49.2, 149.0], [49.3, 150.0], [49.4, 150.0], [49.5, 150.0], [49.6, 150.0], [49.7, 150.0], [49.8, 150.0], [49.9, 150.0], [50.0, 150.0], [50.1, 153.0], [50.2, 153.0], [50.3, 153.0], [50.4, 153.0], [50.5, 153.0], [50.6, 153.0], [50.7, 153.0], [50.8, 153.0], [50.9, 153.0], [51.0, 153.0], [51.1, 153.0], [51.2, 153.0], [51.3, 153.0], [51.4, 153.0], [51.5, 153.0], [51.6, 153.0], [51.7, 153.0], [51.8, 153.0], [51.9, 153.0], [52.0, 153.0], [52.1, 153.0], [52.2, 153.0], [52.3, 154.0], [52.4, 154.0], [52.5, 154.0], [52.6, 154.0], [52.7, 154.0], [52.8, 154.0], [52.9, 154.0], [53.0, 154.0], [53.1, 167.0], [53.2, 167.0], [53.3, 167.0], [53.4, 167.0], [53.5, 167.0], [53.6, 167.0], [53.7, 167.0], [53.8, 170.0], [53.9, 170.0], [54.0, 170.0], [54.1, 170.0], [54.2, 170.0], [54.3, 170.0], [54.4, 170.0], [54.5, 170.0], [54.6, 172.0], [54.7, 172.0], [54.8, 172.0], [54.9, 172.0], [55.0, 172.0], [55.1, 172.0], [55.2, 172.0], [55.3, 172.0], [55.4, 173.0], [55.5, 173.0], [55.6, 173.0], [55.7, 173.0], [55.8, 173.0], [55.9, 173.0], [56.0, 173.0], [56.1, 173.0], [56.2, 173.0], [56.3, 173.0], [56.4, 173.0], [56.5, 173.0], [56.6, 173.0], [56.7, 173.0], [56.8, 173.0], [56.9, 175.0], [57.0, 175.0], [57.1, 175.0], [57.2, 175.0], [57.3, 175.0], [57.4, 175.0], [57.5, 175.0], [57.6, 176.0], [57.7, 176.0], [57.8, 176.0], [57.9, 176.0], [58.0, 176.0], [58.1, 176.0], [58.2, 176.0], [58.3, 176.0], [58.4, 179.0], [58.5, 179.0], [58.6, 179.0], [58.7, 179.0], [58.8, 179.0], [58.9, 179.0], [59.0, 179.0], [59.1, 180.0], [59.2, 180.0], [59.3, 180.0], [59.4, 180.0], [59.5, 180.0], [59.6, 180.0], [59.7, 180.0], [59.8, 180.0], [59.9, 181.0], [60.0, 181.0], [60.1, 181.0], [60.2, 181.0], [60.3, 181.0], [60.4, 181.0], [60.5, 181.0], [60.6, 181.0], [60.7, 185.0], [60.8, 185.0], [60.9, 185.0], [61.0, 185.0], [61.1, 185.0], [61.2, 185.0], [61.3, 185.0], [61.4, 186.0], [61.5, 186.0], [61.6, 186.0], [61.7, 186.0], [61.8, 186.0], [61.9, 186.0], [62.0, 186.0], [62.1, 186.0], [62.2, 199.0], [62.3, 199.0], [62.4, 199.0], [62.5, 199.0], [62.6, 199.0], [62.7, 199.0], [62.8, 199.0], [62.9, 295.0], [63.0, 295.0], [63.1, 295.0], [63.2, 295.0], [63.3, 295.0], [63.4, 295.0], [63.5, 295.0], [63.6, 295.0], [63.7, 299.0], [63.8, 299.0], [63.9, 299.0], [64.0, 299.0], [64.1, 299.0], [64.2, 299.0], [64.3, 299.0], [64.4, 301.0], [64.5, 301.0], [64.6, 301.0], [64.7, 301.0], [64.8, 301.0], [64.9, 301.0], [65.0, 301.0], [65.1, 301.0], [65.2, 335.0], [65.3, 335.0], [65.4, 335.0], [65.5, 335.0], [65.6, 335.0], [65.7, 335.0], [65.8, 335.0], [65.9, 335.0], [66.0, 337.0], [66.1, 337.0], [66.2, 337.0], [66.3, 337.0], [66.4, 337.0], [66.5, 337.0], [66.6, 337.0], [66.7, 357.0], [66.8, 357.0], [66.9, 357.0], [67.0, 357.0], [67.1, 357.0], [67.2, 357.0], [67.3, 357.0], [67.4, 357.0], [67.5, 400.0], [67.6, 400.0], [67.7, 400.0], [67.8, 400.0], [67.9, 400.0], [68.0, 400.0], [68.1, 400.0], [68.2, 405.0], [68.3, 405.0], [68.4, 405.0], [68.5, 405.0], [68.6, 405.0], [68.7, 405.0], [68.8, 405.0], [68.9, 405.0], [69.0, 412.0], [69.1, 412.0], [69.2, 412.0], [69.3, 412.0], [69.4, 412.0], [69.5, 412.0], [69.6, 412.0], [69.7, 416.0], [69.8, 416.0], [69.9, 416.0], [70.0, 416.0], [70.1, 416.0], [70.2, 416.0], [70.3, 416.0], [70.4, 416.0], [70.5, 433.0], [70.6, 433.0], [70.7, 433.0], [70.8, 433.0], [70.9, 433.0], [71.0, 433.0], [71.1, 433.0], [71.2, 433.0], [71.3, 439.0], [71.4, 439.0], [71.5, 439.0], [71.6, 439.0], [71.7, 439.0], [71.8, 439.0], [71.9, 439.0], [72.0, 440.0], [72.1, 440.0], [72.2, 440.0], [72.3, 440.0], [72.4, 440.0], [72.5, 440.0], [72.6, 440.0], [72.7, 440.0], [72.8, 447.0], [72.9, 447.0], [73.0, 447.0], [73.1, 447.0], [73.2, 447.0], [73.3, 447.0], [73.4, 447.0], [73.5, 447.0], [73.6, 447.0], [73.7, 447.0], [73.8, 447.0], [73.9, 447.0], [74.0, 447.0], [74.1, 447.0], [74.2, 447.0], [74.3, 465.0], [74.4, 465.0], [74.5, 465.0], [74.6, 465.0], [74.7, 465.0], [74.8, 465.0], [74.9, 465.0], [75.0, 473.0], [75.1, 473.0], [75.2, 473.0], [75.3, 473.0], [75.4, 473.0], [75.5, 473.0], [75.6, 473.0], [75.7, 473.0], [75.8, 482.0], [75.9, 482.0], [76.0, 482.0], [76.1, 482.0], [76.2, 482.0], [76.3, 482.0], [76.4, 482.0], [76.5, 482.0], [76.6, 495.0], [76.7, 495.0], [76.8, 495.0], [76.9, 495.0], [77.0, 495.0], [77.1, 495.0], [77.2, 495.0], [77.3, 497.0], [77.4, 497.0], [77.5, 497.0], [77.6, 497.0], [77.7, 497.0], [77.8, 497.0], [77.9, 497.0], [78.0, 497.0], [78.1, 512.0], [78.2, 512.0], [78.3, 512.0], [78.4, 512.0], [78.5, 512.0], [78.6, 512.0], [78.7, 512.0], [78.8, 515.0], [78.9, 515.0], [79.0, 515.0], [79.1, 515.0], [79.2, 515.0], [79.3, 515.0], [79.4, 515.0], [79.5, 515.0], [79.6, 522.0], [79.7, 522.0], [79.8, 522.0], [79.9, 522.0], [80.0, 522.0], [80.1, 522.0], [80.2, 522.0], [80.3, 522.0], [80.4, 528.0], [80.5, 528.0], [80.6, 528.0], [80.7, 528.0], [80.8, 528.0], [80.9, 528.0], [81.0, 528.0], [81.1, 541.0], [81.2, 541.0], [81.3, 541.0], [81.4, 541.0], [81.5, 541.0], [81.6, 541.0], [81.7, 541.0], [81.8, 541.0], [81.9, 542.0], [82.0, 542.0], [82.1, 542.0], [82.2, 542.0], [82.3, 542.0], [82.4, 542.0], [82.5, 542.0], [82.6, 561.0], [82.7, 561.0], [82.8, 561.0], [82.9, 561.0], [83.0, 561.0], [83.1, 561.0], [83.2, 561.0], [83.3, 561.0], [83.4, 571.0], [83.5, 571.0], [83.6, 571.0], [83.7, 571.0], [83.8, 571.0], [83.9, 571.0], [84.0, 571.0], [84.1, 572.0], [84.2, 572.0], [84.3, 572.0], [84.4, 572.0], [84.5, 572.0], [84.6, 572.0], [84.7, 572.0], [84.8, 572.0], [84.9, 578.0], [85.0, 578.0], [85.1, 578.0], [85.2, 578.0], [85.3, 578.0], [85.4, 578.0], [85.5, 578.0], [85.6, 578.0], [85.7, 590.0], [85.8, 590.0], [85.9, 590.0], [86.0, 590.0], [86.1, 590.0], [86.2, 590.0], [86.3, 590.0], [86.4, 592.0], [86.5, 592.0], [86.6, 592.0], [86.7, 592.0], [86.8, 592.0], [86.9, 592.0], [87.0, 592.0], [87.1, 592.0], [87.2, 601.0], [87.3, 601.0], [87.4, 601.0], [87.5, 601.0], [87.6, 601.0], [87.7, 601.0], [87.8, 601.0], [87.9, 608.0], [88.0, 608.0], [88.1, 608.0], [88.2, 608.0], [88.3, 608.0], [88.4, 608.0], [88.5, 608.0], [88.6, 608.0], [88.7, 612.0], [88.8, 612.0], [88.9, 612.0], [89.0, 612.0], [89.1, 612.0], [89.2, 612.0], [89.3, 612.0], [89.4, 625.0], [89.5, 625.0], [89.6, 625.0], [89.7, 625.0], [89.8, 625.0], [89.9, 625.0], [90.0, 625.0], [90.1, 625.0], [90.2, 626.0], [90.3, 626.0], [90.4, 626.0], [90.5, 626.0], [90.6, 626.0], [90.7, 626.0], [90.8, 626.0], [90.9, 626.0], [91.0, 635.0], [91.1, 635.0], [91.2, 635.0], [91.3, 635.0], [91.4, 635.0], [91.5, 635.0], [91.6, 635.0], [91.7, 638.0], [91.8, 638.0], [91.9, 638.0], [92.0, 638.0], [92.1, 638.0], [92.2, 638.0], [92.3, 638.0], [92.4, 638.0], [92.5, 642.0], [92.6, 642.0], [92.7, 642.0], [92.8, 642.0], [92.9, 642.0], [93.0, 642.0], [93.1, 642.0], [93.2, 643.0], [93.3, 643.0], [93.4, 643.0], [93.5, 643.0], [93.6, 643.0], [93.7, 643.0], [93.8, 643.0], [93.9, 643.0], [94.0, 643.0], [94.1, 643.0], [94.2, 643.0], [94.3, 643.0], [94.4, 643.0], [94.5, 643.0], [94.6, 643.0], [94.7, 644.0], [94.8, 644.0], [94.9, 644.0], [95.0, 644.0], [95.1, 644.0], [95.2, 644.0], [95.3, 644.0], [95.4, 644.0], [95.5, 649.0], [95.6, 649.0], [95.7, 649.0], [95.8, 649.0], [95.9, 649.0], [96.0, 649.0], [96.1, 649.0], [96.2, 649.0], [96.3, 651.0], [96.4, 651.0], [96.5, 651.0], [96.6, 651.0], [96.7, 651.0], [96.8, 651.0], [96.9, 651.0], [97.0, 651.0], [97.1, 651.0], [97.2, 651.0], [97.3, 651.0], [97.4, 651.0], [97.5, 651.0], [97.6, 651.0], [97.7, 651.0], [97.8, 653.0], [97.9, 653.0], [98.0, 653.0], [98.1, 653.0], [98.2, 653.0], [98.3, 653.0], [98.4, 653.0], [98.5, 657.0], [98.6, 657.0], [98.7, 657.0], [98.8, 657.0], [98.9, 657.0], [99.0, 657.0], [99.1, 657.0], [99.2, 657.0], [99.3, 660.0], [99.4, 660.0], [99.5, 660.0], [99.6, 660.0], [99.7, 660.0], [99.8, 660.0], [99.9, 660.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 51.0, "series": [{"data": [[0.0, 51.0], [600.0, 17.0], [300.0, 4.0], [400.0, 14.0], [200.0, 2.0], [100.0, 32.0], [500.0, 12.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 600.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 29.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 103.0, "series": [{"data": [[0.0, 103.0]], "color": "#9ACD32", "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[1.0, 29.0]], "color": "yellow", "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [], "color": "orange", "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}, {"data": [], "color": "#FF6347", "isOverall": false, "label": "Requests in error", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 37.81818181818182, "minX": 1.76984118E12, "maxY": 37.81818181818182, "series": [{"data": [[1.76984118E12, 37.81818181818182]], "isOverall": false, "label": "线程组-获取宝箱点位列表-关键接口", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.76984118E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 63.0, "minX": 1.0, "maxY": 651.0, "series": [{"data": [[2.0, 67.0], [3.0, 63.0], [5.0, 65.5], [6.0, 75.0], [7.0, 63.0], [8.0, 70.0], [9.0, 68.00000000000001], [10.0, 73.9], [11.0, 78.0], [12.0, 85.0], [14.0, 80.5], [15.0, 186.0], [16.0, 185.0], [17.0, 88.0], [18.0, 136.0], [19.0, 153.5], [21.0, 132.0], [22.0, 179.0], [23.0, 137.0], [24.0, 176.0], [26.0, 174.0], [27.0, 172.5], [28.0, 170.0], [29.0, 153.0], [30.0, 151.0], [31.0, 149.0], [33.0, 368.0], [32.0, 150.0], [34.0, 397.0], [36.0, 319.0], [38.0, 531.0], [41.0, 153.0], [40.0, 543.5], [42.0, 154.0], [45.0, 497.0], [44.0, 522.0], [47.0, 561.0], [46.0, 476.0], [49.0, 651.0], [51.0, 651.0], [52.0, 649.0], [55.0, 541.0], [57.0, 491.5], [56.0, 357.0], [63.0, 642.0], [62.0, 505.0], [65.0, 473.5], [64.0, 578.0], [68.0, 299.66666666666663], [74.0, 403.6666666666667], [76.0, 372.8], [81.0, 391.5], [80.0, 541.5], [87.0, 409.25], [85.0, 394.6666666666667], [91.0, 448.125], [90.0, 612.0], [1.0, 81.0]], "isOverall": false, "label": "HTTP请求", "isController": false}, {"data": [[37.81818181818182, 260.22727272727286]], "isOverall": false, "label": "HTTP请求-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 91.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 950.4, "minX": 1.76984118E12, "maxY": 2173.6, "series": [{"data": [[1.76984118E12, 2173.6]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.76984118E12, 950.4]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.76984118E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 260.22727272727286, "minX": 1.76984118E12, "maxY": 260.22727272727286, "series": [{"data": [[1.76984118E12, 260.22727272727286]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.76984118E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 256.63636363636357, "minX": 1.76984118E12, "maxY": 256.63636363636357, "series": [{"data": [[1.76984118E12, 256.63636363636357]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.76984118E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 228.1363636363637, "minX": 1.76984118E12, "maxY": 228.1363636363637, "series": [{"data": [[1.76984118E12, 228.1363636363637]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.76984118E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 61.0, "minX": 1.76984118E12, "maxY": 660.0, "series": [{"data": [[1.76984118E12, 660.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.76984118E12, 625.7]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.76984118E12, 659.01]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.76984118E12, 645.75]], "isOverall": false, "label": "95th percentile", "isController": false}, {"data": [[1.76984118E12, 61.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.76984118E12, 151.5]], "isOverall": false, "label": "Median", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.76984118E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 151.5, "minX": 132.0, "maxY": 151.5, "series": [{"data": [[132.0, 151.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 132.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 149.5, "minX": 132.0, "maxY": 149.5, "series": [{"data": [[132.0, 149.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 132.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 2.2, "minX": 1.76984118E12, "maxY": 2.2, "series": [{"data": [[1.76984118E12, 2.2]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.76984118E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 2.2, "minX": 1.76984118E12, "maxY": 2.2, "series": [{"data": [[1.76984118E12, 2.2]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.76984118E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 2.2, "minX": 1.76984118E12, "maxY": 2.2, "series": [{"data": [[1.76984118E12, 2.2]], "isOverall": false, "label": "HTTP请求-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.76984118E12, "title": "Transactions Per Second"}},
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
        data: {"result": {"minY": 2.2, "minX": 1.76984118E12, "maxY": 2.2, "series": [{"data": [[1.76984118E12, 2.2]], "isOverall": false, "label": "Transaction-success", "isController": false}, {"data": [], "isOverall": false, "label": "Transaction-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.76984118E12, "title": "Total Transactions Per Second"}},
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

