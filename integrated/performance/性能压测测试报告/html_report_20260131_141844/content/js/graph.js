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
        data: {"result": {"minY": 341.0, "minX": 0.0, "maxY": 1277.0, "series": [{"data": [[0.0, 341.0], [0.1, 341.0], [0.2, 341.0], [0.3, 341.0], [0.4, 341.0], [0.5, 350.0], [0.6, 350.0], [0.7, 350.0], [0.8, 350.0], [0.9, 350.0], [1.0, 357.0], [1.1, 357.0], [1.2, 357.0], [1.3, 357.0], [1.4, 357.0], [1.5, 373.0], [1.6, 373.0], [1.7, 373.0], [1.8, 373.0], [1.9, 373.0], [2.0, 375.0], [2.1, 375.0], [2.2, 375.0], [2.3, 375.0], [2.4, 375.0], [2.5, 389.0], [2.6, 389.0], [2.7, 389.0], [2.8, 389.0], [2.9, 389.0], [3.0, 396.0], [3.1, 396.0], [3.2, 396.0], [3.3, 396.0], [3.4, 396.0], [3.5, 397.0], [3.6, 397.0], [3.7, 397.0], [3.8, 397.0], [3.9, 397.0], [4.0, 399.0], [4.1, 399.0], [4.2, 399.0], [4.3, 399.0], [4.4, 399.0], [4.5, 404.0], [4.6, 404.0], [4.7, 404.0], [4.8, 404.0], [4.9, 404.0], [5.0, 406.0], [5.1, 406.0], [5.2, 406.0], [5.3, 406.0], [5.4, 406.0], [5.5, 409.0], [5.6, 409.0], [5.7, 409.0], [5.8, 409.0], [5.9, 409.0], [6.0, 414.0], [6.1, 414.0], [6.2, 414.0], [6.3, 414.0], [6.4, 414.0], [6.5, 420.0], [6.6, 420.0], [6.7, 420.0], [6.8, 420.0], [6.9, 420.0], [7.0, 420.0], [7.1, 420.0], [7.2, 420.0], [7.3, 420.0], [7.4, 420.0], [7.5, 422.0], [7.6, 422.0], [7.7, 422.0], [7.8, 422.0], [7.9, 422.0], [8.0, 424.0], [8.1, 424.0], [8.2, 424.0], [8.3, 424.0], [8.4, 424.0], [8.5, 424.0], [8.6, 424.0], [8.7, 424.0], [8.8, 424.0], [8.9, 424.0], [9.0, 425.0], [9.1, 425.0], [9.2, 425.0], [9.3, 425.0], [9.4, 425.0], [9.5, 433.0], [9.6, 433.0], [9.7, 433.0], [9.8, 433.0], [9.9, 433.0], [10.0, 437.0], [10.1, 437.0], [10.2, 437.0], [10.3, 437.0], [10.4, 437.0], [10.5, 437.0], [10.6, 437.0], [10.7, 437.0], [10.8, 437.0], [10.9, 437.0], [11.0, 439.0], [11.1, 439.0], [11.2, 439.0], [11.3, 439.0], [11.4, 439.0], [11.5, 439.0], [11.6, 439.0], [11.7, 439.0], [11.8, 439.0], [11.9, 439.0], [12.0, 442.0], [12.1, 442.0], [12.2, 442.0], [12.3, 442.0], [12.4, 442.0], [12.5, 442.0], [12.6, 442.0], [12.7, 442.0], [12.8, 442.0], [12.9, 442.0], [13.0, 443.0], [13.1, 443.0], [13.2, 443.0], [13.3, 443.0], [13.4, 443.0], [13.5, 443.0], [13.6, 443.0], [13.7, 443.0], [13.8, 443.0], [13.9, 443.0], [14.0, 445.0], [14.1, 445.0], [14.2, 445.0], [14.3, 445.0], [14.4, 445.0], [14.5, 447.0], [14.6, 447.0], [14.7, 447.0], [14.8, 447.0], [14.9, 447.0], [15.0, 447.0], [15.1, 447.0], [15.2, 447.0], [15.3, 447.0], [15.4, 447.0], [15.5, 448.0], [15.6, 448.0], [15.7, 448.0], [15.8, 448.0], [15.9, 448.0], [16.0, 449.0], [16.1, 449.0], [16.2, 449.0], [16.3, 449.0], [16.4, 449.0], [16.5, 451.0], [16.6, 451.0], [16.7, 451.0], [16.8, 451.0], [16.9, 451.0], [17.0, 451.0], [17.1, 451.0], [17.2, 451.0], [17.3, 451.0], [17.4, 451.0], [17.5, 451.0], [17.6, 451.0], [17.7, 451.0], [17.8, 451.0], [17.9, 451.0], [18.0, 456.0], [18.1, 456.0], [18.2, 456.0], [18.3, 456.0], [18.4, 456.0], [18.5, 457.0], [18.6, 457.0], [18.7, 457.0], [18.8, 457.0], [18.9, 457.0], [19.0, 459.0], [19.1, 459.0], [19.2, 459.0], [19.3, 459.0], [19.4, 459.0], [19.5, 461.0], [19.6, 461.0], [19.7, 461.0], [19.8, 461.0], [19.9, 461.0], [20.0, 464.0], [20.1, 464.0], [20.2, 464.0], [20.3, 464.0], [20.4, 464.0], [20.5, 465.0], [20.6, 465.0], [20.7, 465.0], [20.8, 465.0], [20.9, 465.0], [21.0, 465.0], [21.1, 465.0], [21.2, 465.0], [21.3, 465.0], [21.4, 465.0], [21.5, 466.0], [21.6, 466.0], [21.7, 466.0], [21.8, 466.0], [21.9, 466.0], [22.0, 467.0], [22.1, 467.0], [22.2, 467.0], [22.3, 467.0], [22.4, 467.0], [22.5, 470.0], [22.6, 470.0], [22.7, 470.0], [22.8, 470.0], [22.9, 470.0], [23.0, 470.0], [23.1, 470.0], [23.2, 470.0], [23.3, 470.0], [23.4, 470.0], [23.5, 470.0], [23.6, 470.0], [23.7, 470.0], [23.8, 470.0], [23.9, 470.0], [24.0, 471.0], [24.1, 471.0], [24.2, 471.0], [24.3, 471.0], [24.4, 471.0], [24.5, 471.0], [24.6, 471.0], [24.7, 471.0], [24.8, 471.0], [24.9, 471.0], [25.0, 472.0], [25.1, 472.0], [25.2, 472.0], [25.3, 472.0], [25.4, 472.0], [25.5, 479.0], [25.6, 479.0], [25.7, 479.0], [25.8, 479.0], [25.9, 479.0], [26.0, 479.0], [26.1, 479.0], [26.2, 479.0], [26.3, 479.0], [26.4, 479.0], [26.5, 481.0], [26.6, 481.0], [26.7, 481.0], [26.8, 481.0], [26.9, 481.0], [27.0, 482.0], [27.1, 482.0], [27.2, 482.0], [27.3, 482.0], [27.4, 482.0], [27.5, 482.0], [27.6, 482.0], [27.7, 482.0], [27.8, 482.0], [27.9, 482.0], [28.0, 483.0], [28.1, 483.0], [28.2, 483.0], [28.3, 483.0], [28.4, 483.0], [28.5, 485.0], [28.6, 485.0], [28.7, 485.0], [28.8, 485.0], [28.9, 485.0], [29.0, 486.0], [29.1, 486.0], [29.2, 486.0], [29.3, 486.0], [29.4, 486.0], [29.5, 486.0], [29.6, 486.0], [29.7, 486.0], [29.8, 486.0], [29.9, 486.0], [30.0, 487.0], [30.1, 487.0], [30.2, 487.0], [30.3, 487.0], [30.4, 487.0], [30.5, 495.0], [30.6, 495.0], [30.7, 495.0], [30.8, 495.0], [30.9, 495.0], [31.0, 495.0], [31.1, 495.0], [31.2, 495.0], [31.3, 495.0], [31.4, 495.0], [31.5, 497.0], [31.6, 497.0], [31.7, 497.0], [31.8, 497.0], [31.9, 497.0], [32.0, 497.0], [32.1, 497.0], [32.2, 497.0], [32.3, 497.0], [32.4, 497.0], [32.5, 497.0], [32.6, 497.0], [32.7, 497.0], [32.8, 497.0], [32.9, 497.0], [33.0, 500.0], [33.1, 500.0], [33.2, 500.0], [33.3, 500.0], [33.4, 500.0], [33.5, 505.0], [33.6, 505.0], [33.7, 505.0], [33.8, 505.0], [33.9, 505.0], [34.0, 505.0], [34.1, 505.0], [34.2, 505.0], [34.3, 505.0], [34.4, 505.0], [34.5, 506.0], [34.6, 506.0], [34.7, 506.0], [34.8, 506.0], [34.9, 506.0], [35.0, 507.0], [35.1, 507.0], [35.2, 507.0], [35.3, 507.0], [35.4, 507.0], [35.5, 507.0], [35.6, 507.0], [35.7, 507.0], [35.8, 507.0], [35.9, 507.0], [36.0, 508.0], [36.1, 508.0], [36.2, 508.0], [36.3, 508.0], [36.4, 508.0], [36.5, 508.0], [36.6, 508.0], [36.7, 508.0], [36.8, 508.0], [36.9, 508.0], [37.0, 510.0], [37.1, 510.0], [37.2, 510.0], [37.3, 510.0], [37.4, 510.0], [37.5, 512.0], [37.6, 512.0], [37.7, 512.0], [37.8, 512.0], [37.9, 512.0], [38.0, 513.0], [38.1, 513.0], [38.2, 513.0], [38.3, 513.0], [38.4, 513.0], [38.5, 515.0], [38.6, 515.0], [38.7, 515.0], [38.8, 515.0], [38.9, 515.0], [39.0, 516.0], [39.1, 516.0], [39.2, 516.0], [39.3, 516.0], [39.4, 516.0], [39.5, 517.0], [39.6, 517.0], [39.7, 517.0], [39.8, 517.0], [39.9, 517.0], [40.0, 518.0], [40.1, 518.0], [40.2, 518.0], [40.3, 518.0], [40.4, 518.0], [40.5, 518.0], [40.6, 518.0], [40.7, 518.0], [40.8, 518.0], [40.9, 518.0], [41.0, 518.0], [41.1, 518.0], [41.2, 518.0], [41.3, 518.0], [41.4, 518.0], [41.5, 518.0], [41.6, 518.0], [41.7, 518.0], [41.8, 518.0], [41.9, 518.0], [42.0, 519.0], [42.1, 519.0], [42.2, 519.0], [42.3, 519.0], [42.4, 519.0], [42.5, 519.0], [42.6, 519.0], [42.7, 519.0], [42.8, 519.0], [42.9, 519.0], [43.0, 519.0], [43.1, 519.0], [43.2, 519.0], [43.3, 519.0], [43.4, 519.0], [43.5, 520.0], [43.6, 520.0], [43.7, 520.0], [43.8, 520.0], [43.9, 520.0], [44.0, 522.0], [44.1, 522.0], [44.2, 522.0], [44.3, 522.0], [44.4, 522.0], [44.5, 522.0], [44.6, 522.0], [44.7, 522.0], [44.8, 522.0], [44.9, 522.0], [45.0, 524.0], [45.1, 524.0], [45.2, 524.0], [45.3, 524.0], [45.4, 524.0], [45.5, 524.0], [45.6, 524.0], [45.7, 524.0], [45.8, 524.0], [45.9, 524.0], [46.0, 524.0], [46.1, 524.0], [46.2, 524.0], [46.3, 524.0], [46.4, 524.0], [46.5, 524.0], [46.6, 524.0], [46.7, 524.0], [46.8, 524.0], [46.9, 524.0], [47.0, 525.0], [47.1, 525.0], [47.2, 525.0], [47.3, 525.0], [47.4, 525.0], [47.5, 525.0], [47.6, 525.0], [47.7, 525.0], [47.8, 525.0], [47.9, 525.0], [48.0, 526.0], [48.1, 526.0], [48.2, 526.0], [48.3, 526.0], [48.4, 526.0], [48.5, 527.0], [48.6, 527.0], [48.7, 527.0], [48.8, 527.0], [48.9, 527.0], [49.0, 528.0], [49.1, 528.0], [49.2, 528.0], [49.3, 528.0], [49.4, 528.0], [49.5, 529.0], [49.6, 529.0], [49.7, 529.0], [49.8, 529.0], [49.9, 529.0], [50.0, 530.0], [50.1, 530.0], [50.2, 530.0], [50.3, 530.0], [50.4, 530.0], [50.5, 530.0], [50.6, 530.0], [50.7, 530.0], [50.8, 530.0], [50.9, 530.0], [51.0, 530.0], [51.1, 530.0], [51.2, 530.0], [51.3, 530.0], [51.4, 530.0], [51.5, 531.0], [51.6, 531.0], [51.7, 531.0], [51.8, 531.0], [51.9, 531.0], [52.0, 531.0], [52.1, 531.0], [52.2, 531.0], [52.3, 531.0], [52.4, 531.0], [52.5, 531.0], [52.6, 531.0], [52.7, 531.0], [52.8, 531.0], [52.9, 531.0], [53.0, 531.0], [53.1, 531.0], [53.2, 531.0], [53.3, 531.0], [53.4, 531.0], [53.5, 532.0], [53.6, 532.0], [53.7, 532.0], [53.8, 532.0], [53.9, 532.0], [54.0, 532.0], [54.1, 532.0], [54.2, 532.0], [54.3, 532.0], [54.4, 532.0], [54.5, 532.0], [54.6, 532.0], [54.7, 532.0], [54.8, 532.0], [54.9, 532.0], [55.0, 533.0], [55.1, 533.0], [55.2, 533.0], [55.3, 533.0], [55.4, 533.0], [55.5, 533.0], [55.6, 533.0], [55.7, 533.0], [55.8, 533.0], [55.9, 533.0], [56.0, 533.0], [56.1, 533.0], [56.2, 533.0], [56.3, 533.0], [56.4, 533.0], [56.5, 534.0], [56.6, 534.0], [56.7, 534.0], [56.8, 534.0], [56.9, 534.0], [57.0, 534.0], [57.1, 534.0], [57.2, 534.0], [57.3, 534.0], [57.4, 534.0], [57.5, 535.0], [57.6, 535.0], [57.7, 535.0], [57.8, 535.0], [57.9, 535.0], [58.0, 537.0], [58.1, 537.0], [58.2, 537.0], [58.3, 537.0], [58.4, 537.0], [58.5, 539.0], [58.6, 539.0], [58.7, 539.0], [58.8, 539.0], [58.9, 539.0], [59.0, 540.0], [59.1, 540.0], [59.2, 540.0], [59.3, 540.0], [59.4, 540.0], [59.5, 545.0], [59.6, 545.0], [59.7, 545.0], [59.8, 545.0], [59.9, 545.0], [60.0, 545.0], [60.1, 545.0], [60.2, 545.0], [60.3, 545.0], [60.4, 545.0], [60.5, 545.0], [60.6, 545.0], [60.7, 545.0], [60.8, 545.0], [60.9, 545.0], [61.0, 548.0], [61.1, 548.0], [61.2, 548.0], [61.3, 548.0], [61.4, 548.0], [61.5, 550.0], [61.6, 550.0], [61.7, 550.0], [61.8, 550.0], [61.9, 550.0], [62.0, 551.0], [62.1, 551.0], [62.2, 551.0], [62.3, 551.0], [62.4, 551.0], [62.5, 577.0], [62.6, 577.0], [62.7, 577.0], [62.8, 577.0], [62.9, 577.0], [63.0, 584.0], [63.1, 584.0], [63.2, 584.0], [63.3, 584.0], [63.4, 584.0], [63.5, 586.0], [63.6, 586.0], [63.7, 586.0], [63.8, 586.0], [63.9, 586.0], [64.0, 593.0], [64.1, 593.0], [64.2, 593.0], [64.3, 593.0], [64.4, 593.0], [64.5, 594.0], [64.6, 594.0], [64.7, 594.0], [64.8, 594.0], [64.9, 594.0], [65.0, 609.0], [65.1, 609.0], [65.2, 609.0], [65.3, 609.0], [65.4, 609.0], [65.5, 632.0], [65.6, 632.0], [65.7, 632.0], [65.8, 632.0], [65.9, 632.0], [66.0, 638.0], [66.1, 638.0], [66.2, 638.0], [66.3, 638.0], [66.4, 638.0], [66.5, 673.0], [66.6, 673.0], [66.7, 673.0], [66.8, 673.0], [66.9, 673.0], [67.0, 694.0], [67.1, 694.0], [67.2, 694.0], [67.3, 694.0], [67.4, 694.0], [67.5, 705.0], [67.6, 705.0], [67.7, 705.0], [67.8, 705.0], [67.9, 705.0], [68.0, 708.0], [68.1, 708.0], [68.2, 708.0], [68.3, 708.0], [68.4, 708.0], [68.5, 722.0], [68.6, 722.0], [68.7, 722.0], [68.8, 722.0], [68.9, 722.0], [69.0, 735.0], [69.1, 735.0], [69.2, 735.0], [69.3, 735.0], [69.4, 735.0], [69.5, 749.0], [69.6, 749.0], [69.7, 749.0], [69.8, 749.0], [69.9, 749.0], [70.0, 766.0], [70.1, 766.0], [70.2, 766.0], [70.3, 766.0], [70.4, 766.0], [70.5, 771.0], [70.6, 771.0], [70.7, 771.0], [70.8, 771.0], [70.9, 771.0], [71.0, 780.0], [71.1, 780.0], [71.2, 780.0], [71.3, 780.0], [71.4, 780.0], [71.5, 784.0], [71.6, 784.0], [71.7, 784.0], [71.8, 784.0], [71.9, 784.0], [72.0, 787.0], [72.1, 787.0], [72.2, 787.0], [72.3, 787.0], [72.4, 787.0], [72.5, 798.0], [72.6, 798.0], [72.7, 798.0], [72.8, 798.0], [72.9, 798.0], [73.0, 798.0], [73.1, 798.0], [73.2, 798.0], [73.3, 798.0], [73.4, 798.0], [73.5, 805.0], [73.6, 805.0], [73.7, 805.0], [73.8, 805.0], [73.9, 805.0], [74.0, 807.0], [74.1, 807.0], [74.2, 807.0], [74.3, 807.0], [74.4, 807.0], [74.5, 814.0], [74.6, 814.0], [74.7, 814.0], [74.8, 814.0], [74.9, 814.0], [75.0, 835.0], [75.1, 835.0], [75.2, 835.0], [75.3, 835.0], [75.4, 835.0], [75.5, 841.0], [75.6, 841.0], [75.7, 841.0], [75.8, 841.0], [75.9, 841.0], [76.0, 858.0], [76.1, 858.0], [76.2, 858.0], [76.3, 858.0], [76.4, 858.0], [76.5, 864.0], [76.6, 864.0], [76.7, 864.0], [76.8, 864.0], [76.9, 864.0], [77.0, 866.0], [77.1, 866.0], [77.2, 866.0], [77.3, 866.0], [77.4, 866.0], [77.5, 869.0], [77.6, 869.0], [77.7, 869.0], [77.8, 869.0], [77.9, 869.0], [78.0, 873.0], [78.1, 873.0], [78.2, 873.0], [78.3, 873.0], [78.4, 873.0], [78.5, 880.0], [78.6, 880.0], [78.7, 880.0], [78.8, 880.0], [78.9, 880.0], [79.0, 896.0], [79.1, 896.0], [79.2, 896.0], [79.3, 896.0], [79.4, 896.0], [79.5, 907.0], [79.6, 907.0], [79.7, 907.0], [79.8, 907.0], [79.9, 907.0], [80.0, 922.0], [80.1, 922.0], [80.2, 922.0], [80.3, 922.0], [80.4, 922.0], [80.5, 938.0], [80.6, 938.0], [80.7, 938.0], [80.8, 938.0], [80.9, 938.0], [81.0, 939.0], [81.1, 939.0], [81.2, 939.0], [81.3, 939.0], [81.4, 939.0], [81.5, 939.0], [81.6, 939.0], [81.7, 939.0], [81.8, 939.0], [81.9, 939.0], [82.0, 950.0], [82.1, 950.0], [82.2, 950.0], [82.3, 950.0], [82.4, 950.0], [82.5, 955.0], [82.6, 955.0], [82.7, 955.0], [82.8, 955.0], [82.9, 955.0], [83.0, 970.0], [83.1, 970.0], [83.2, 970.0], [83.3, 970.0], [83.4, 970.0], [83.5, 981.0], [83.6, 981.0], [83.7, 981.0], [83.8, 981.0], [83.9, 981.0], [84.0, 983.0], [84.1, 983.0], [84.2, 983.0], [84.3, 983.0], [84.4, 983.0], [84.5, 993.0], [84.6, 993.0], [84.7, 993.0], [84.8, 993.0], [84.9, 993.0], [85.0, 1005.0], [85.1, 1005.0], [85.2, 1005.0], [85.3, 1005.0], [85.4, 1005.0], [85.5, 1006.0], [85.6, 1006.0], [85.7, 1006.0], [85.8, 1006.0], [85.9, 1006.0], [86.0, 1007.0], [86.1, 1007.0], [86.2, 1007.0], [86.3, 1007.0], [86.4, 1007.0], [86.5, 1013.0], [86.6, 1013.0], [86.7, 1013.0], [86.8, 1013.0], [86.9, 1013.0], [87.0, 1014.0], [87.1, 1014.0], [87.2, 1014.0], [87.3, 1014.0], [87.4, 1014.0], [87.5, 1017.0], [87.6, 1017.0], [87.7, 1017.0], [87.8, 1017.0], [87.9, 1017.0], [88.0, 1018.0], [88.1, 1018.0], [88.2, 1018.0], [88.3, 1018.0], [88.4, 1018.0], [88.5, 1022.0], [88.6, 1022.0], [88.7, 1022.0], [88.8, 1022.0], [88.9, 1022.0], [89.0, 1028.0], [89.1, 1028.0], [89.2, 1028.0], [89.3, 1028.0], [89.4, 1028.0], [89.5, 1029.0], [89.6, 1029.0], [89.7, 1029.0], [89.8, 1029.0], [89.9, 1029.0], [90.0, 1033.0], [90.1, 1033.0], [90.2, 1033.0], [90.3, 1033.0], [90.4, 1033.0], [90.5, 1043.0], [90.6, 1043.0], [90.7, 1043.0], [90.8, 1043.0], [90.9, 1043.0], [91.0, 1043.0], [91.1, 1043.0], [91.2, 1043.0], [91.3, 1043.0], [91.4, 1043.0], [91.5, 1047.0], [91.6, 1047.0], [91.7, 1047.0], [91.8, 1047.0], [91.9, 1047.0], [92.0, 1064.0], [92.1, 1064.0], [92.2, 1064.0], [92.3, 1064.0], [92.4, 1064.0], [92.5, 1066.0], [92.6, 1066.0], [92.7, 1066.0], [92.8, 1066.0], [92.9, 1066.0], [93.0, 1071.0], [93.1, 1071.0], [93.2, 1071.0], [93.3, 1071.0], [93.4, 1071.0], [93.5, 1073.0], [93.6, 1073.0], [93.7, 1073.0], [93.8, 1073.0], [93.9, 1073.0], [94.0, 1098.0], [94.1, 1098.0], [94.2, 1098.0], [94.3, 1098.0], [94.4, 1098.0], [94.5, 1114.0], [94.6, 1114.0], [94.7, 1114.0], [94.8, 1114.0], [94.9, 1114.0], [95.0, 1139.0], [95.1, 1139.0], [95.2, 1139.0], [95.3, 1139.0], [95.4, 1139.0], [95.5, 1147.0], [95.6, 1147.0], [95.7, 1147.0], [95.8, 1147.0], [95.9, 1147.0], [96.0, 1148.0], [96.1, 1148.0], [96.2, 1148.0], [96.3, 1148.0], [96.4, 1148.0], [96.5, 1159.0], [96.6, 1159.0], [96.7, 1159.0], [96.8, 1159.0], [96.9, 1159.0], [97.0, 1178.0], [97.1, 1178.0], [97.2, 1178.0], [97.3, 1178.0], [97.4, 1178.0], [97.5, 1191.0], [97.6, 1191.0], [97.7, 1191.0], [97.8, 1191.0], [97.9, 1191.0], [98.0, 1203.0], [98.1, 1203.0], [98.2, 1203.0], [98.3, 1203.0], [98.4, 1203.0], [98.5, 1228.0], [98.6, 1228.0], [98.7, 1228.0], [98.8, 1228.0], [98.9, 1228.0], [99.0, 1266.0], [99.1, 1266.0], [99.2, 1266.0], [99.3, 1266.0], [99.4, 1266.0], [99.5, 1277.0], [99.6, 1277.0], [99.7, 1277.0], [99.8, 1277.0], [99.9, 1277.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 4.0, "minX": 300.0, "maxY": 64.0, "series": [{"data": [[1100.0, 7.0], [300.0, 9.0], [600.0, 5.0], [1200.0, 4.0], [700.0, 12.0], [400.0, 57.0], [800.0, 12.0], [900.0, 11.0], [500.0, 64.0], [1000.0, 19.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 1200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 67.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 133.0, "series": [{"data": [[0.0, 67.0]], "color": "#9ACD32", "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[1.0, 133.0]], "color": "yellow", "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [], "color": "orange", "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}, {"data": [], "color": "#FF6347", "isOverall": false, "label": "Requests in error", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 95.78999999999995, "minX": 1.76984028E12, "maxY": 95.78999999999995, "series": [{"data": [[1.76984028E12, 95.78999999999995]], "isOverall": false, "label": "线程组-用户信息-关键接口", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.76984028E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 375.0, "minX": 1.0, "maxY": 1266.0, "series": [{"data": [[2.0, 533.0], [4.0, 536.5], [5.0, 530.0], [6.0, 535.0], [7.0, 526.0], [8.0, 465.0], [9.0, 528.0], [11.0, 437.0], [12.0, 497.5], [15.0, 508.0], [17.0, 479.0], [19.0, 525.0], [20.0, 524.0], [21.0, 540.0], [22.0, 532.0], [24.0, 477.5], [25.0, 513.0], [28.0, 526.3333333333334], [29.0, 531.0], [31.0, 488.0], [35.0, 519.0], [34.0, 491.6666666666667], [37.0, 480.5], [39.0, 520.0], [41.0, 539.5], [40.0, 522.0], [44.0, 460.3333333333333], [46.0, 530.0], [49.0, 484.5], [48.0, 524.0], [51.0, 530.0], [53.0, 518.0], [52.0, 479.3333333333333], [55.0, 459.5], [57.0, 938.0], [56.0, 508.0], [60.0, 647.6666666666666], [67.0, 508.0], [66.0, 470.0], [65.0, 515.0], [64.0, 479.5], [71.0, 481.0], [70.0, 497.0], [69.0, 993.0], [68.0, 1064.0], [75.0, 482.5], [74.0, 1006.0], [73.0, 485.0], [79.0, 482.0], [78.0, 451.0], [77.0, 487.0], [76.0, 471.0], [82.0, 904.0], [80.0, 471.0], [87.0, 1266.0], [86.0, 1228.0], [85.0, 498.0], [91.0, 893.0], [89.0, 483.0], [95.0, 1159.0], [99.0, 1120.75], [97.0, 722.0], [96.0, 467.0], [103.0, 1203.0], [102.0, 456.0], [101.0, 739.0], [107.0, 481.5], [105.0, 505.0], [104.0, 537.0], [111.0, 495.0], [110.0, 495.0], [109.0, 866.0], [108.0, 486.0], [115.0, 955.0], [114.0, 470.0], [113.0, 482.0], [112.0, 424.0], [119.0, 472.0], [118.0, 981.0], [117.0, 466.0], [116.0, 1114.0], [123.0, 1073.0], [122.0, 1033.0], [121.0, 1043.0], [120.0, 447.0], [127.0, 1147.0], [126.0, 445.5], [124.0, 443.0], [135.0, 1028.0], [134.0, 864.0], [133.0, 425.0], [132.0, 1029.0], [131.0, 389.0], [130.0, 748.5], [128.0, 406.0], [142.0, 1036.5], [140.0, 1071.0], [139.0, 873.0], [138.0, 685.5], [136.0, 375.0], [146.0, 396.0], [148.0, 642.0], [147.0, 484.4], [150.0, 636.0], [151.0, 431.5], [149.0, 726.5], [144.0, 1045.0], [152.0, 840.3333333333334], [159.0, 655.8], [157.0, 679.6666666666666], [158.0, 781.5], [156.0, 630.8], [154.0, 847.0], [155.0, 838.5], [153.0, 1013.0], [160.0, 644.0], [161.0, 688.6666666666666], [1.0, 533.0]], "isOverall": false, "label": "HTTP请求", "isController": false}, {"data": [[95.78999999999995, 645.4450000000002]], "isOverall": false, "label": "HTTP请求-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 161.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1340.0, "minX": 1.76984028E12, "maxY": 13120.0, "series": [{"data": [[1.76984028E12, 13120.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.76984028E12, 1340.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.76984028E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 645.4450000000002, "minX": 1.76984028E12, "maxY": 645.4450000000002, "series": [{"data": [[1.76984028E12, 645.4450000000002]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.76984028E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 631.4449999999999, "minX": 1.76984028E12, "maxY": 631.4449999999999, "series": [{"data": [[1.76984028E12, 631.4449999999999]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.76984028E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 286.395, "minX": 1.76984028E12, "maxY": 286.395, "series": [{"data": [[1.76984028E12, 286.395]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.76984028E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 341.0, "minX": 1.76984028E12, "maxY": 1277.0, "series": [{"data": [[1.76984028E12, 1277.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.76984028E12, 1032.6]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.76984028E12, 1265.6200000000003]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.76984028E12, 1137.7499999999998]], "isOverall": false, "label": "95th percentile", "isController": false}, {"data": [[1.76984028E12, 341.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.76984028E12, 529.5]], "isOverall": false, "label": "Median", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.76984028E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 524.0, "minX": 45.0, "maxY": 632.0, "series": [{"data": [[155.0, 524.0], [45.0, 632.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 155.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 524.0, "minX": 45.0, "maxY": 577.0, "series": [{"data": [[155.0, 524.0], [45.0, 577.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 155.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.76984028E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.76984028E12, 3.3333333333333335]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.76984028E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.76984028E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.76984028E12, 3.3333333333333335]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.76984028E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.76984028E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.76984028E12, 3.3333333333333335]], "isOverall": false, "label": "HTTP请求-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.76984028E12, "title": "Transactions Per Second"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.76984028E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.76984028E12, 3.3333333333333335]], "isOverall": false, "label": "Transaction-success", "isController": false}, {"data": [], "isOverall": false, "label": "Transaction-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.76984028E12, "title": "Total Transactions Per Second"}},
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

