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
        data: {"result": {"minY": 229.0, "minX": 0.0, "maxY": 1712.0, "series": [{"data": [[0.0, 229.0], [0.1, 229.0], [0.2, 229.0], [0.3, 229.0], [0.4, 229.0], [0.5, 233.0], [0.6, 233.0], [0.7, 233.0], [0.8, 233.0], [0.9, 233.0], [1.0, 239.0], [1.1, 239.0], [1.2, 239.0], [1.3, 239.0], [1.4, 239.0], [1.5, 253.0], [1.6, 253.0], [1.7, 253.0], [1.8, 253.0], [1.9, 253.0], [2.0, 258.0], [2.1, 258.0], [2.2, 258.0], [2.3, 258.0], [2.4, 258.0], [2.5, 264.0], [2.6, 264.0], [2.7, 264.0], [2.8, 264.0], [2.9, 264.0], [3.0, 265.0], [3.1, 265.0], [3.2, 265.0], [3.3, 265.0], [3.4, 265.0], [3.5, 270.0], [3.6, 270.0], [3.7, 270.0], [3.8, 270.0], [3.9, 270.0], [4.0, 279.0], [4.1, 279.0], [4.2, 279.0], [4.3, 279.0], [4.4, 279.0], [4.5, 285.0], [4.6, 285.0], [4.7, 285.0], [4.8, 285.0], [4.9, 285.0], [5.0, 285.0], [5.1, 285.0], [5.2, 285.0], [5.3, 285.0], [5.4, 285.0], [5.5, 288.0], [5.6, 288.0], [5.7, 288.0], [5.8, 288.0], [5.9, 288.0], [6.0, 290.0], [6.1, 290.0], [6.2, 290.0], [6.3, 290.0], [6.4, 290.0], [6.5, 290.0], [6.6, 290.0], [6.7, 290.0], [6.8, 290.0], [6.9, 290.0], [7.0, 299.0], [7.1, 299.0], [7.2, 299.0], [7.3, 299.0], [7.4, 299.0], [7.5, 307.0], [7.6, 307.0], [7.7, 307.0], [7.8, 307.0], [7.9, 307.0], [8.0, 309.0], [8.1, 309.0], [8.2, 309.0], [8.3, 309.0], [8.4, 309.0], [8.5, 309.0], [8.6, 309.0], [8.7, 309.0], [8.8, 309.0], [8.9, 309.0], [9.0, 315.0], [9.1, 315.0], [9.2, 315.0], [9.3, 315.0], [9.4, 315.0], [9.5, 316.0], [9.6, 316.0], [9.7, 316.0], [9.8, 316.0], [9.9, 316.0], [10.0, 318.0], [10.1, 318.0], [10.2, 318.0], [10.3, 318.0], [10.4, 318.0], [10.5, 320.0], [10.6, 320.0], [10.7, 320.0], [10.8, 320.0], [10.9, 320.0], [11.0, 323.0], [11.1, 323.0], [11.2, 323.0], [11.3, 323.0], [11.4, 323.0], [11.5, 326.0], [11.6, 326.0], [11.7, 326.0], [11.8, 326.0], [11.9, 326.0], [12.0, 328.0], [12.1, 328.0], [12.2, 328.0], [12.3, 328.0], [12.4, 328.0], [12.5, 330.0], [12.6, 330.0], [12.7, 330.0], [12.8, 330.0], [12.9, 330.0], [13.0, 331.0], [13.1, 331.0], [13.2, 331.0], [13.3, 331.0], [13.4, 331.0], [13.5, 348.0], [13.6, 348.0], [13.7, 348.0], [13.8, 348.0], [13.9, 348.0], [14.0, 353.0], [14.1, 353.0], [14.2, 353.0], [14.3, 353.0], [14.4, 353.0], [14.5, 356.0], [14.6, 356.0], [14.7, 356.0], [14.8, 356.0], [14.9, 356.0], [15.0, 357.0], [15.1, 357.0], [15.2, 357.0], [15.3, 357.0], [15.4, 357.0], [15.5, 358.0], [15.6, 358.0], [15.7, 358.0], [15.8, 358.0], [15.9, 358.0], [16.0, 360.0], [16.1, 360.0], [16.2, 360.0], [16.3, 360.0], [16.4, 360.0], [16.5, 360.0], [16.6, 360.0], [16.7, 360.0], [16.8, 360.0], [16.9, 360.0], [17.0, 364.0], [17.1, 364.0], [17.2, 364.0], [17.3, 364.0], [17.4, 364.0], [17.5, 365.0], [17.6, 365.0], [17.7, 365.0], [17.8, 365.0], [17.9, 365.0], [18.0, 369.0], [18.1, 369.0], [18.2, 369.0], [18.3, 369.0], [18.4, 369.0], [18.5, 373.0], [18.6, 373.0], [18.7, 373.0], [18.8, 373.0], [18.9, 373.0], [19.0, 379.0], [19.1, 379.0], [19.2, 379.0], [19.3, 379.0], [19.4, 379.0], [19.5, 380.0], [19.6, 380.0], [19.7, 380.0], [19.8, 380.0], [19.9, 380.0], [20.0, 385.0], [20.1, 385.0], [20.2, 385.0], [20.3, 385.0], [20.4, 385.0], [20.5, 391.0], [20.6, 391.0], [20.7, 391.0], [20.8, 391.0], [20.9, 391.0], [21.0, 397.0], [21.1, 397.0], [21.2, 397.0], [21.3, 397.0], [21.4, 397.0], [21.5, 401.0], [21.6, 401.0], [21.7, 401.0], [21.8, 401.0], [21.9, 401.0], [22.0, 406.0], [22.1, 406.0], [22.2, 406.0], [22.3, 406.0], [22.4, 406.0], [22.5, 410.0], [22.6, 410.0], [22.7, 410.0], [22.8, 410.0], [22.9, 410.0], [23.0, 413.0], [23.1, 413.0], [23.2, 413.0], [23.3, 413.0], [23.4, 413.0], [23.5, 415.0], [23.6, 415.0], [23.7, 415.0], [23.8, 415.0], [23.9, 415.0], [24.0, 419.0], [24.1, 419.0], [24.2, 419.0], [24.3, 419.0], [24.4, 419.0], [24.5, 421.0], [24.6, 421.0], [24.7, 421.0], [24.8, 421.0], [24.9, 421.0], [25.0, 421.0], [25.1, 421.0], [25.2, 421.0], [25.3, 421.0], [25.4, 421.0], [25.5, 426.0], [25.6, 426.0], [25.7, 426.0], [25.8, 426.0], [25.9, 426.0], [26.0, 427.0], [26.1, 427.0], [26.2, 427.0], [26.3, 427.0], [26.4, 427.0], [26.5, 429.0], [26.6, 429.0], [26.7, 429.0], [26.8, 429.0], [26.9, 429.0], [27.0, 431.0], [27.1, 431.0], [27.2, 431.0], [27.3, 431.0], [27.4, 431.0], [27.5, 437.0], [27.6, 437.0], [27.7, 437.0], [27.8, 437.0], [27.9, 437.0], [28.0, 441.0], [28.1, 441.0], [28.2, 441.0], [28.3, 441.0], [28.4, 441.0], [28.5, 446.0], [28.6, 446.0], [28.7, 446.0], [28.8, 446.0], [28.9, 446.0], [29.0, 450.0], [29.1, 450.0], [29.2, 450.0], [29.3, 450.0], [29.4, 450.0], [29.5, 451.0], [29.6, 451.0], [29.7, 451.0], [29.8, 451.0], [29.9, 451.0], [30.0, 452.0], [30.1, 452.0], [30.2, 452.0], [30.3, 452.0], [30.4, 452.0], [30.5, 452.0], [30.6, 452.0], [30.7, 452.0], [30.8, 452.0], [30.9, 452.0], [31.0, 453.0], [31.1, 453.0], [31.2, 453.0], [31.3, 453.0], [31.4, 453.0], [31.5, 455.0], [31.6, 455.0], [31.7, 455.0], [31.8, 455.0], [31.9, 455.0], [32.0, 455.0], [32.1, 455.0], [32.2, 455.0], [32.3, 455.0], [32.4, 455.0], [32.5, 456.0], [32.6, 456.0], [32.7, 456.0], [32.8, 456.0], [32.9, 456.0], [33.0, 458.0], [33.1, 458.0], [33.2, 458.0], [33.3, 458.0], [33.4, 458.0], [33.5, 460.0], [33.6, 460.0], [33.7, 460.0], [33.8, 460.0], [33.9, 460.0], [34.0, 462.0], [34.1, 462.0], [34.2, 462.0], [34.3, 462.0], [34.4, 462.0], [34.5, 465.0], [34.6, 465.0], [34.7, 465.0], [34.8, 465.0], [34.9, 465.0], [35.0, 467.0], [35.1, 467.0], [35.2, 467.0], [35.3, 467.0], [35.4, 467.0], [35.5, 470.0], [35.6, 470.0], [35.7, 470.0], [35.8, 470.0], [35.9, 470.0], [36.0, 472.0], [36.1, 472.0], [36.2, 472.0], [36.3, 472.0], [36.4, 472.0], [36.5, 472.0], [36.6, 472.0], [36.7, 472.0], [36.8, 472.0], [36.9, 472.0], [37.0, 474.0], [37.1, 474.0], [37.2, 474.0], [37.3, 474.0], [37.4, 474.0], [37.5, 478.0], [37.6, 478.0], [37.7, 478.0], [37.8, 478.0], [37.9, 478.0], [38.0, 478.0], [38.1, 478.0], [38.2, 478.0], [38.3, 478.0], [38.4, 478.0], [38.5, 480.0], [38.6, 480.0], [38.7, 480.0], [38.8, 480.0], [38.9, 480.0], [39.0, 482.0], [39.1, 482.0], [39.2, 482.0], [39.3, 482.0], [39.4, 482.0], [39.5, 483.0], [39.6, 483.0], [39.7, 483.0], [39.8, 483.0], [39.9, 483.0], [40.0, 485.0], [40.1, 485.0], [40.2, 485.0], [40.3, 485.0], [40.4, 485.0], [40.5, 485.0], [40.6, 485.0], [40.7, 485.0], [40.8, 485.0], [40.9, 485.0], [41.0, 489.0], [41.1, 489.0], [41.2, 489.0], [41.3, 489.0], [41.4, 489.0], [41.5, 489.0], [41.6, 489.0], [41.7, 489.0], [41.8, 489.0], [41.9, 489.0], [42.0, 491.0], [42.1, 491.0], [42.2, 491.0], [42.3, 491.0], [42.4, 491.0], [42.5, 493.0], [42.6, 493.0], [42.7, 493.0], [42.8, 493.0], [42.9, 493.0], [43.0, 493.0], [43.1, 493.0], [43.2, 493.0], [43.3, 493.0], [43.4, 493.0], [43.5, 495.0], [43.6, 495.0], [43.7, 495.0], [43.8, 495.0], [43.9, 495.0], [44.0, 497.0], [44.1, 497.0], [44.2, 497.0], [44.3, 497.0], [44.4, 497.0], [44.5, 500.0], [44.6, 500.0], [44.7, 500.0], [44.8, 500.0], [44.9, 500.0], [45.0, 508.0], [45.1, 508.0], [45.2, 508.0], [45.3, 508.0], [45.4, 508.0], [45.5, 508.0], [45.6, 508.0], [45.7, 508.0], [45.8, 508.0], [45.9, 508.0], [46.0, 517.0], [46.1, 517.0], [46.2, 517.0], [46.3, 517.0], [46.4, 517.0], [46.5, 517.0], [46.6, 517.0], [46.7, 517.0], [46.8, 517.0], [46.9, 517.0], [47.0, 520.0], [47.1, 520.0], [47.2, 520.0], [47.3, 520.0], [47.4, 520.0], [47.5, 520.0], [47.6, 520.0], [47.7, 520.0], [47.8, 520.0], [47.9, 520.0], [48.0, 526.0], [48.1, 526.0], [48.2, 526.0], [48.3, 526.0], [48.4, 526.0], [48.5, 536.0], [48.6, 536.0], [48.7, 536.0], [48.8, 536.0], [48.9, 536.0], [49.0, 541.0], [49.1, 541.0], [49.2, 541.0], [49.3, 541.0], [49.4, 541.0], [49.5, 543.0], [49.6, 543.0], [49.7, 543.0], [49.8, 543.0], [49.9, 543.0], [50.0, 550.0], [50.1, 550.0], [50.2, 550.0], [50.3, 550.0], [50.4, 550.0], [50.5, 551.0], [50.6, 551.0], [50.7, 551.0], [50.8, 551.0], [50.9, 551.0], [51.0, 552.0], [51.1, 552.0], [51.2, 552.0], [51.3, 552.0], [51.4, 552.0], [51.5, 555.0], [51.6, 555.0], [51.7, 555.0], [51.8, 555.0], [51.9, 555.0], [52.0, 556.0], [52.1, 556.0], [52.2, 556.0], [52.3, 556.0], [52.4, 556.0], [52.5, 557.0], [52.6, 557.0], [52.7, 557.0], [52.8, 557.0], [52.9, 557.0], [53.0, 561.0], [53.1, 561.0], [53.2, 561.0], [53.3, 561.0], [53.4, 561.0], [53.5, 563.0], [53.6, 563.0], [53.7, 563.0], [53.8, 563.0], [53.9, 563.0], [54.0, 567.0], [54.1, 567.0], [54.2, 567.0], [54.3, 567.0], [54.4, 567.0], [54.5, 575.0], [54.6, 575.0], [54.7, 575.0], [54.8, 575.0], [54.9, 575.0], [55.0, 580.0], [55.1, 580.0], [55.2, 580.0], [55.3, 580.0], [55.4, 580.0], [55.5, 588.0], [55.6, 588.0], [55.7, 588.0], [55.8, 588.0], [55.9, 588.0], [56.0, 599.0], [56.1, 599.0], [56.2, 599.0], [56.3, 599.0], [56.4, 599.0], [56.5, 599.0], [56.6, 599.0], [56.7, 599.0], [56.8, 599.0], [56.9, 599.0], [57.0, 614.0], [57.1, 614.0], [57.2, 614.0], [57.3, 614.0], [57.4, 614.0], [57.5, 616.0], [57.6, 616.0], [57.7, 616.0], [57.8, 616.0], [57.9, 616.0], [58.0, 627.0], [58.1, 627.0], [58.2, 627.0], [58.3, 627.0], [58.4, 627.0], [58.5, 634.0], [58.6, 634.0], [58.7, 634.0], [58.8, 634.0], [58.9, 634.0], [59.0, 636.0], [59.1, 636.0], [59.2, 636.0], [59.3, 636.0], [59.4, 636.0], [59.5, 642.0], [59.6, 642.0], [59.7, 642.0], [59.8, 642.0], [59.9, 642.0], [60.0, 642.0], [60.1, 642.0], [60.2, 642.0], [60.3, 642.0], [60.4, 642.0], [60.5, 645.0], [60.6, 645.0], [60.7, 645.0], [60.8, 645.0], [60.9, 645.0], [61.0, 649.0], [61.1, 649.0], [61.2, 649.0], [61.3, 649.0], [61.4, 649.0], [61.5, 650.0], [61.6, 650.0], [61.7, 650.0], [61.8, 650.0], [61.9, 650.0], [62.0, 653.0], [62.1, 653.0], [62.2, 653.0], [62.3, 653.0], [62.4, 653.0], [62.5, 655.0], [62.6, 655.0], [62.7, 655.0], [62.8, 655.0], [62.9, 655.0], [63.0, 661.0], [63.1, 661.0], [63.2, 661.0], [63.3, 661.0], [63.4, 661.0], [63.5, 675.0], [63.6, 675.0], [63.7, 675.0], [63.8, 675.0], [63.9, 675.0], [64.0, 676.0], [64.1, 676.0], [64.2, 676.0], [64.3, 676.0], [64.4, 676.0], [64.5, 676.0], [64.6, 676.0], [64.7, 676.0], [64.8, 676.0], [64.9, 676.0], [65.0, 680.0], [65.1, 680.0], [65.2, 680.0], [65.3, 680.0], [65.4, 680.0], [65.5, 689.0], [65.6, 689.0], [65.7, 689.0], [65.8, 689.0], [65.9, 689.0], [66.0, 689.0], [66.1, 689.0], [66.2, 689.0], [66.3, 689.0], [66.4, 689.0], [66.5, 691.0], [66.6, 691.0], [66.7, 691.0], [66.8, 691.0], [66.9, 691.0], [67.0, 694.0], [67.1, 694.0], [67.2, 694.0], [67.3, 694.0], [67.4, 694.0], [67.5, 694.0], [67.6, 694.0], [67.7, 694.0], [67.8, 694.0], [67.9, 694.0], [68.0, 694.0], [68.1, 694.0], [68.2, 694.0], [68.3, 694.0], [68.4, 694.0], [68.5, 709.0], [68.6, 709.0], [68.7, 709.0], [68.8, 709.0], [68.9, 709.0], [69.0, 717.0], [69.1, 717.0], [69.2, 717.0], [69.3, 717.0], [69.4, 717.0], [69.5, 718.0], [69.6, 718.0], [69.7, 718.0], [69.8, 718.0], [69.9, 718.0], [70.0, 720.0], [70.1, 720.0], [70.2, 720.0], [70.3, 720.0], [70.4, 720.0], [70.5, 721.0], [70.6, 721.0], [70.7, 721.0], [70.8, 721.0], [70.9, 721.0], [71.0, 724.0], [71.1, 724.0], [71.2, 724.0], [71.3, 724.0], [71.4, 724.0], [71.5, 728.0], [71.6, 728.0], [71.7, 728.0], [71.8, 728.0], [71.9, 728.0], [72.0, 730.0], [72.1, 730.0], [72.2, 730.0], [72.3, 730.0], [72.4, 730.0], [72.5, 741.0], [72.6, 741.0], [72.7, 741.0], [72.8, 741.0], [72.9, 741.0], [73.0, 746.0], [73.1, 746.0], [73.2, 746.0], [73.3, 746.0], [73.4, 746.0], [73.5, 749.0], [73.6, 749.0], [73.7, 749.0], [73.8, 749.0], [73.9, 749.0], [74.0, 751.0], [74.1, 751.0], [74.2, 751.0], [74.3, 751.0], [74.4, 751.0], [74.5, 751.0], [74.6, 751.0], [74.7, 751.0], [74.8, 751.0], [74.9, 751.0], [75.0, 752.0], [75.1, 752.0], [75.2, 752.0], [75.3, 752.0], [75.4, 752.0], [75.5, 758.0], [75.6, 758.0], [75.7, 758.0], [75.8, 758.0], [75.9, 758.0], [76.0, 771.0], [76.1, 771.0], [76.2, 771.0], [76.3, 771.0], [76.4, 771.0], [76.5, 777.0], [76.6, 777.0], [76.7, 777.0], [76.8, 777.0], [76.9, 777.0], [77.0, 780.0], [77.1, 780.0], [77.2, 780.0], [77.3, 780.0], [77.4, 780.0], [77.5, 783.0], [77.6, 783.0], [77.7, 783.0], [77.8, 783.0], [77.9, 783.0], [78.0, 791.0], [78.1, 791.0], [78.2, 791.0], [78.3, 791.0], [78.4, 791.0], [78.5, 794.0], [78.6, 794.0], [78.7, 794.0], [78.8, 794.0], [78.9, 794.0], [79.0, 798.0], [79.1, 798.0], [79.2, 798.0], [79.3, 798.0], [79.4, 798.0], [79.5, 799.0], [79.6, 799.0], [79.7, 799.0], [79.8, 799.0], [79.9, 799.0], [80.0, 800.0], [80.1, 800.0], [80.2, 800.0], [80.3, 800.0], [80.4, 800.0], [80.5, 800.0], [80.6, 800.0], [80.7, 800.0], [80.8, 800.0], [80.9, 800.0], [81.0, 807.0], [81.1, 807.0], [81.2, 807.0], [81.3, 807.0], [81.4, 807.0], [81.5, 818.0], [81.6, 818.0], [81.7, 818.0], [81.8, 818.0], [81.9, 818.0], [82.0, 818.0], [82.1, 818.0], [82.2, 818.0], [82.3, 818.0], [82.4, 818.0], [82.5, 835.0], [82.6, 835.0], [82.7, 835.0], [82.8, 835.0], [82.9, 835.0], [83.0, 838.0], [83.1, 838.0], [83.2, 838.0], [83.3, 838.0], [83.4, 838.0], [83.5, 839.0], [83.6, 839.0], [83.7, 839.0], [83.8, 839.0], [83.9, 839.0], [84.0, 847.0], [84.1, 847.0], [84.2, 847.0], [84.3, 847.0], [84.4, 847.0], [84.5, 847.0], [84.6, 847.0], [84.7, 847.0], [84.8, 847.0], [84.9, 847.0], [85.0, 849.0], [85.1, 849.0], [85.2, 849.0], [85.3, 849.0], [85.4, 849.0], [85.5, 853.0], [85.6, 853.0], [85.7, 853.0], [85.8, 853.0], [85.9, 853.0], [86.0, 861.0], [86.1, 861.0], [86.2, 861.0], [86.3, 861.0], [86.4, 861.0], [86.5, 864.0], [86.6, 864.0], [86.7, 864.0], [86.8, 864.0], [86.9, 864.0], [87.0, 879.0], [87.1, 879.0], [87.2, 879.0], [87.3, 879.0], [87.4, 879.0], [87.5, 907.0], [87.6, 907.0], [87.7, 907.0], [87.8, 907.0], [87.9, 907.0], [88.0, 910.0], [88.1, 910.0], [88.2, 910.0], [88.3, 910.0], [88.4, 910.0], [88.5, 913.0], [88.6, 913.0], [88.7, 913.0], [88.8, 913.0], [88.9, 913.0], [89.0, 914.0], [89.1, 914.0], [89.2, 914.0], [89.3, 914.0], [89.4, 914.0], [89.5, 914.0], [89.6, 914.0], [89.7, 914.0], [89.8, 914.0], [89.9, 914.0], [90.0, 917.0], [90.1, 917.0], [90.2, 917.0], [90.3, 917.0], [90.4, 917.0], [90.5, 918.0], [90.6, 918.0], [90.7, 918.0], [90.8, 918.0], [90.9, 918.0], [91.0, 925.0], [91.1, 925.0], [91.2, 925.0], [91.3, 925.0], [91.4, 925.0], [91.5, 938.0], [91.6, 938.0], [91.7, 938.0], [91.8, 938.0], [91.9, 938.0], [92.0, 940.0], [92.1, 940.0], [92.2, 940.0], [92.3, 940.0], [92.4, 940.0], [92.5, 941.0], [92.6, 941.0], [92.7, 941.0], [92.8, 941.0], [92.9, 941.0], [93.0, 949.0], [93.1, 949.0], [93.2, 949.0], [93.3, 949.0], [93.4, 949.0], [93.5, 950.0], [93.6, 950.0], [93.7, 950.0], [93.8, 950.0], [93.9, 950.0], [94.0, 950.0], [94.1, 950.0], [94.2, 950.0], [94.3, 950.0], [94.4, 950.0], [94.5, 952.0], [94.6, 952.0], [94.7, 952.0], [94.8, 952.0], [94.9, 952.0], [95.0, 960.0], [95.1, 960.0], [95.2, 960.0], [95.3, 960.0], [95.4, 960.0], [95.5, 962.0], [95.6, 962.0], [95.7, 962.0], [95.8, 962.0], [95.9, 962.0], [96.0, 997.0], [96.1, 997.0], [96.2, 997.0], [96.3, 997.0], [96.4, 997.0], [96.5, 1091.0], [96.6, 1091.0], [96.7, 1091.0], [96.8, 1091.0], [96.9, 1091.0], [97.0, 1100.0], [97.1, 1100.0], [97.2, 1100.0], [97.3, 1100.0], [97.4, 1100.0], [97.5, 1105.0], [97.6, 1105.0], [97.7, 1105.0], [97.8, 1105.0], [97.9, 1105.0], [98.0, 1110.0], [98.1, 1110.0], [98.2, 1110.0], [98.3, 1110.0], [98.4, 1110.0], [98.5, 1221.0], [98.6, 1221.0], [98.7, 1221.0], [98.8, 1221.0], [98.9, 1221.0], [99.0, 1265.0], [99.1, 1265.0], [99.2, 1265.0], [99.3, 1265.0], [99.4, 1265.0], [99.5, 1712.0], [99.6, 1712.0], [99.7, 1712.0], [99.8, 1712.0], [99.9, 1712.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 200.0, "maxY": 46.0, "series": [{"data": [[1100.0, 3.0], [300.0, 28.0], [600.0, 23.0], [1200.0, 2.0], [700.0, 23.0], [400.0, 46.0], [800.0, 15.0], [200.0, 15.0], [1700.0, 1.0], [900.0, 18.0], [500.0, 25.0], [1000.0, 1.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1700.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 109.0, "series": [{"data": [[0.0, 90.0]], "color": "#9ACD32", "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[1.0, 109.0]], "color": "yellow", "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 1.0]], "color": "orange", "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}, {"data": [], "color": "#FF6347", "isOverall": false, "label": "Requests in error", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 95.82000000000004, "minX": 1.7749281E12, "maxY": 95.82000000000004, "series": [{"data": [[1.7749281E12, 95.82000000000004]], "isOverall": false, "label": "线程组-用户信息-关键接口", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7749281E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 258.0, "minX": 1.0, "maxY": 1712.0, "series": [{"data": [[2.0, 1091.0], [3.0, 1221.0], [4.0, 1105.0], [5.0, 1110.0], [6.0, 1100.0], [7.0, 555.0], [8.0, 634.0], [9.0, 541.0], [10.0, 839.0], [11.0, 751.0], [12.0, 751.0], [13.0, 709.0], [14.0, 794.0], [15.0, 847.0], [16.0, 1265.0], [17.0, 650.0], [18.0, 724.0], [20.0, 274.5], [23.0, 258.0], [25.0, 270.0], [28.0, 268.25], [29.0, 258.0], [33.0, 286.0], [40.0, 290.0], [43.0, 380.0], [42.0, 345.625], [49.0, 380.1666666666667], [51.0, 358.0], [53.0, 328.0], [52.0, 426.0], [56.0, 395.6666666666667], [59.0, 411.3333333333333], [61.0, 369.0], [60.0, 478.0], [63.0, 357.0], [62.0, 462.0], [67.0, 427.6666666666667], [64.0, 391.0], [71.0, 429.0], [70.0, 358.0], [69.0, 470.0], [68.0, 364.0], [75.0, 431.0], [74.0, 419.0], [73.0, 447.5], [79.0, 517.0], [78.0, 489.0], [77.0, 452.0], [83.0, 524.0], [81.0, 472.0], [80.0, 556.0], [87.0, 580.0], [86.0, 474.0], [85.0, 485.0], [84.0, 452.0], [91.0, 974.5], [89.0, 486.5], [93.0, 493.0], [92.0, 561.0], [99.0, 616.3333333333334], [103.0, 864.0], [102.0, 557.0], [101.0, 551.0], [100.0, 960.0], [106.0, 917.0], [105.0, 478.0], [104.0, 675.0], [111.0, 941.0], [110.0, 744.0], [108.0, 740.5], [114.0, 771.0], [113.0, 562.5], [117.0, 493.0], [116.0, 658.5], [123.0, 482.0], [122.0, 834.5], [120.0, 847.3333333333334], [127.0, 598.5], [125.0, 842.0], [134.0, 500.0], [133.0, 627.0], [132.0, 563.0], [131.0, 798.5], [129.0, 860.0], [137.0, 678.25], [143.0, 495.0], [141.0, 835.0], [140.0, 746.0], [139.0, 455.0], [138.0, 783.0], [148.0, 572.0], [147.0, 373.0], [149.0, 611.3333333333334], [150.0, 591.5], [151.0, 521.1666666666666], [146.0, 827.8], [153.0, 573.8333333333334], [152.0, 605.0], [156.0, 563.0], [157.0, 687.2500000000001], [155.0, 729.3333333333334], [159.0, 702.6666666666666], [158.0, 631.3333333333334], [154.0, 726.0], [163.0, 775.0], [160.0, 817.0], [1.0, 1712.0]], "isOverall": false, "label": "HTTP请求", "isController": false}, {"data": [[95.81500000000001, 594.6699999999998]], "isOverall": false, "label": "HTTP请求-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 163.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1400.0, "minX": 1.7749281E12, "maxY": 13540.0, "series": [{"data": [[1.7749281E12, 13540.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.7749281E12, 1400.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7749281E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 594.6699999999998, "minX": 1.7749281E12, "maxY": 594.6699999999998, "series": [{"data": [[1.7749281E12, 594.6699999999998]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7749281E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 594.6350000000002, "minX": 1.7749281E12, "maxY": 594.6350000000002, "series": [{"data": [[1.7749281E12, 594.6350000000002]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7749281E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 191.70000000000002, "minX": 1.7749281E12, "maxY": 191.70000000000002, "series": [{"data": [[1.7749281E12, 191.70000000000002]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7749281E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 229.0, "minX": 1.7749281E12, "maxY": 1712.0, "series": [{"data": [[1.7749281E12, 1712.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.7749281E12, 916.7]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.7749281E12, 1264.5600000000004]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.7749281E12, 959.5999999999999]], "isOverall": false, "label": "95th percentile", "isController": false}, {"data": [[1.7749281E12, 229.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.7749281E12, 546.5]], "isOverall": false, "label": "Median", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7749281E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 520.0, "minX": 3.0, "maxY": 1221.0, "series": [{"data": [[182.0, 542.0], [3.0, 1221.0], [15.0, 520.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 182.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 520.0, "minX": 3.0, "maxY": 1221.0, "series": [{"data": [[182.0, 542.0], [3.0, 1221.0], [15.0, 520.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 182.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.7749281E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.7749281E12, 3.3333333333333335]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7749281E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.7749281E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.7749281E12, 3.3333333333333335]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7749281E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.7749281E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.7749281E12, 3.3333333333333335]], "isOverall": false, "label": "HTTP请求-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7749281E12, "title": "Transactions Per Second"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.7749281E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.7749281E12, 3.3333333333333335]], "isOverall": false, "label": "Transaction-success", "isController": false}, {"data": [], "isOverall": false, "label": "Transaction-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7749281E12, "title": "Total Transactions Per Second"}},
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

