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
        data: {"result": {"minY": 304.0, "minX": 0.0, "maxY": 3901.0, "series": [{"data": [[0.0, 304.0], [0.1, 304.0], [0.2, 304.0], [0.3, 304.0], [0.4, 304.0], [0.5, 312.0], [0.6, 312.0], [0.7, 312.0], [0.8, 312.0], [0.9, 312.0], [1.0, 314.0], [1.1, 314.0], [1.2, 314.0], [1.3, 314.0], [1.4, 314.0], [1.5, 319.0], [1.6, 319.0], [1.7, 319.0], [1.8, 319.0], [1.9, 319.0], [2.0, 324.0], [2.1, 324.0], [2.2, 324.0], [2.3, 324.0], [2.4, 324.0], [2.5, 328.0], [2.6, 328.0], [2.7, 328.0], [2.8, 328.0], [2.9, 328.0], [3.0, 329.0], [3.1, 329.0], [3.2, 329.0], [3.3, 329.0], [3.4, 329.0], [3.5, 333.0], [3.6, 333.0], [3.7, 333.0], [3.8, 333.0], [3.9, 333.0], [4.0, 343.0], [4.1, 343.0], [4.2, 343.0], [4.3, 343.0], [4.4, 343.0], [4.5, 348.0], [4.6, 348.0], [4.7, 348.0], [4.8, 348.0], [4.9, 348.0], [5.0, 350.0], [5.1, 350.0], [5.2, 350.0], [5.3, 350.0], [5.4, 350.0], [5.5, 352.0], [5.6, 352.0], [5.7, 352.0], [5.8, 352.0], [5.9, 352.0], [6.0, 356.0], [6.1, 356.0], [6.2, 356.0], [6.3, 356.0], [6.4, 356.0], [6.5, 363.0], [6.6, 363.0], [6.7, 363.0], [6.8, 363.0], [6.9, 363.0], [7.0, 368.0], [7.1, 368.0], [7.2, 368.0], [7.3, 368.0], [7.4, 368.0], [7.5, 371.0], [7.6, 371.0], [7.7, 371.0], [7.8, 371.0], [7.9, 371.0], [8.0, 378.0], [8.1, 378.0], [8.2, 378.0], [8.3, 378.0], [8.4, 378.0], [8.5, 383.0], [8.6, 383.0], [8.7, 383.0], [8.8, 383.0], [8.9, 383.0], [9.0, 388.0], [9.1, 388.0], [9.2, 388.0], [9.3, 388.0], [9.4, 388.0], [9.5, 392.0], [9.6, 392.0], [9.7, 392.0], [9.8, 392.0], [9.9, 392.0], [10.0, 401.0], [10.1, 401.0], [10.2, 401.0], [10.3, 401.0], [10.4, 401.0], [10.5, 404.0], [10.6, 404.0], [10.7, 404.0], [10.8, 404.0], [10.9, 404.0], [11.0, 406.0], [11.1, 406.0], [11.2, 406.0], [11.3, 406.0], [11.4, 406.0], [11.5, 409.0], [11.6, 409.0], [11.7, 409.0], [11.8, 409.0], [11.9, 409.0], [12.0, 413.0], [12.1, 413.0], [12.2, 413.0], [12.3, 413.0], [12.4, 413.0], [12.5, 423.0], [12.6, 423.0], [12.7, 423.0], [12.8, 423.0], [12.9, 423.0], [13.0, 423.0], [13.1, 423.0], [13.2, 423.0], [13.3, 423.0], [13.4, 423.0], [13.5, 426.0], [13.6, 426.0], [13.7, 426.0], [13.8, 426.0], [13.9, 426.0], [14.0, 427.0], [14.1, 427.0], [14.2, 427.0], [14.3, 427.0], [14.4, 427.0], [14.5, 427.0], [14.6, 427.0], [14.7, 427.0], [14.8, 427.0], [14.9, 427.0], [15.0, 431.0], [15.1, 431.0], [15.2, 431.0], [15.3, 431.0], [15.4, 431.0], [15.5, 442.0], [15.6, 442.0], [15.7, 442.0], [15.8, 442.0], [15.9, 442.0], [16.0, 447.0], [16.1, 447.0], [16.2, 447.0], [16.3, 447.0], [16.4, 447.0], [16.5, 450.0], [16.6, 450.0], [16.7, 450.0], [16.8, 450.0], [16.9, 450.0], [17.0, 454.0], [17.1, 454.0], [17.2, 454.0], [17.3, 454.0], [17.4, 454.0], [17.5, 455.0], [17.6, 455.0], [17.7, 455.0], [17.8, 455.0], [17.9, 455.0], [18.0, 463.0], [18.1, 463.0], [18.2, 463.0], [18.3, 463.0], [18.4, 463.0], [18.5, 468.0], [18.6, 468.0], [18.7, 468.0], [18.8, 468.0], [18.9, 468.0], [19.0, 473.0], [19.1, 473.0], [19.2, 473.0], [19.3, 473.0], [19.4, 473.0], [19.5, 475.0], [19.6, 475.0], [19.7, 475.0], [19.8, 475.0], [19.9, 475.0], [20.0, 477.0], [20.1, 477.0], [20.2, 477.0], [20.3, 477.0], [20.4, 477.0], [20.5, 484.0], [20.6, 484.0], [20.7, 484.0], [20.8, 484.0], [20.9, 484.0], [21.0, 490.0], [21.1, 490.0], [21.2, 490.0], [21.3, 490.0], [21.4, 490.0], [21.5, 494.0], [21.6, 494.0], [21.7, 494.0], [21.8, 494.0], [21.9, 494.0], [22.0, 496.0], [22.1, 496.0], [22.2, 496.0], [22.3, 496.0], [22.4, 496.0], [22.5, 500.0], [22.6, 500.0], [22.7, 500.0], [22.8, 500.0], [22.9, 500.0], [23.0, 500.0], [23.1, 500.0], [23.2, 500.0], [23.3, 500.0], [23.4, 500.0], [23.5, 504.0], [23.6, 504.0], [23.7, 504.0], [23.8, 504.0], [23.9, 504.0], [24.0, 507.0], [24.1, 507.0], [24.2, 507.0], [24.3, 507.0], [24.4, 507.0], [24.5, 512.0], [24.6, 512.0], [24.7, 512.0], [24.8, 512.0], [24.9, 512.0], [25.0, 516.0], [25.1, 516.0], [25.2, 516.0], [25.3, 516.0], [25.4, 516.0], [25.5, 520.0], [25.6, 520.0], [25.7, 520.0], [25.8, 520.0], [25.9, 520.0], [26.0, 523.0], [26.1, 523.0], [26.2, 523.0], [26.3, 523.0], [26.4, 523.0], [26.5, 524.0], [26.6, 524.0], [26.7, 524.0], [26.8, 524.0], [26.9, 524.0], [27.0, 525.0], [27.1, 525.0], [27.2, 525.0], [27.3, 525.0], [27.4, 525.0], [27.5, 527.0], [27.6, 527.0], [27.7, 527.0], [27.8, 527.0], [27.9, 527.0], [28.0, 528.0], [28.1, 528.0], [28.2, 528.0], [28.3, 528.0], [28.4, 528.0], [28.5, 531.0], [28.6, 531.0], [28.7, 531.0], [28.8, 531.0], [28.9, 531.0], [29.0, 533.0], [29.1, 533.0], [29.2, 533.0], [29.3, 533.0], [29.4, 533.0], [29.5, 534.0], [29.6, 534.0], [29.7, 534.0], [29.8, 534.0], [29.9, 534.0], [30.0, 538.0], [30.1, 538.0], [30.2, 538.0], [30.3, 538.0], [30.4, 538.0], [30.5, 539.0], [30.6, 539.0], [30.7, 539.0], [30.8, 539.0], [30.9, 539.0], [31.0, 539.0], [31.1, 539.0], [31.2, 539.0], [31.3, 539.0], [31.4, 539.0], [31.5, 541.0], [31.6, 541.0], [31.7, 541.0], [31.8, 541.0], [31.9, 541.0], [32.0, 542.0], [32.1, 542.0], [32.2, 542.0], [32.3, 542.0], [32.4, 542.0], [32.5, 546.0], [32.6, 546.0], [32.7, 546.0], [32.8, 546.0], [32.9, 546.0], [33.0, 555.0], [33.1, 555.0], [33.2, 555.0], [33.3, 555.0], [33.4, 555.0], [33.5, 556.0], [33.6, 556.0], [33.7, 556.0], [33.8, 556.0], [33.9, 556.0], [34.0, 557.0], [34.1, 557.0], [34.2, 557.0], [34.3, 557.0], [34.4, 557.0], [34.5, 558.0], [34.6, 558.0], [34.7, 558.0], [34.8, 558.0], [34.9, 558.0], [35.0, 560.0], [35.1, 560.0], [35.2, 560.0], [35.3, 560.0], [35.4, 560.0], [35.5, 564.0], [35.6, 564.0], [35.7, 564.0], [35.8, 564.0], [35.9, 564.0], [36.0, 570.0], [36.1, 570.0], [36.2, 570.0], [36.3, 570.0], [36.4, 570.0], [36.5, 572.0], [36.6, 572.0], [36.7, 572.0], [36.8, 572.0], [36.9, 572.0], [37.0, 577.0], [37.1, 577.0], [37.2, 577.0], [37.3, 577.0], [37.4, 577.0], [37.5, 581.0], [37.6, 581.0], [37.7, 581.0], [37.8, 581.0], [37.9, 581.0], [38.0, 581.0], [38.1, 581.0], [38.2, 581.0], [38.3, 581.0], [38.4, 581.0], [38.5, 583.0], [38.6, 583.0], [38.7, 583.0], [38.8, 583.0], [38.9, 583.0], [39.0, 584.0], [39.1, 584.0], [39.2, 584.0], [39.3, 584.0], [39.4, 584.0], [39.5, 586.0], [39.6, 586.0], [39.7, 586.0], [39.8, 586.0], [39.9, 586.0], [40.0, 589.0], [40.1, 589.0], [40.2, 589.0], [40.3, 589.0], [40.4, 589.0], [40.5, 589.0], [40.6, 589.0], [40.7, 589.0], [40.8, 589.0], [40.9, 589.0], [41.0, 590.0], [41.1, 590.0], [41.2, 590.0], [41.3, 590.0], [41.4, 590.0], [41.5, 596.0], [41.6, 596.0], [41.7, 596.0], [41.8, 596.0], [41.9, 596.0], [42.0, 601.0], [42.1, 601.0], [42.2, 601.0], [42.3, 601.0], [42.4, 601.0], [42.5, 603.0], [42.6, 603.0], [42.7, 603.0], [42.8, 603.0], [42.9, 603.0], [43.0, 606.0], [43.1, 606.0], [43.2, 606.0], [43.3, 606.0], [43.4, 606.0], [43.5, 609.0], [43.6, 609.0], [43.7, 609.0], [43.8, 609.0], [43.9, 609.0], [44.0, 609.0], [44.1, 609.0], [44.2, 609.0], [44.3, 609.0], [44.4, 609.0], [44.5, 609.0], [44.6, 609.0], [44.7, 609.0], [44.8, 609.0], [44.9, 609.0], [45.0, 611.0], [45.1, 611.0], [45.2, 611.0], [45.3, 611.0], [45.4, 611.0], [45.5, 617.0], [45.6, 617.0], [45.7, 617.0], [45.8, 617.0], [45.9, 617.0], [46.0, 620.0], [46.1, 620.0], [46.2, 620.0], [46.3, 620.0], [46.4, 620.0], [46.5, 621.0], [46.6, 621.0], [46.7, 621.0], [46.8, 621.0], [46.9, 621.0], [47.0, 622.0], [47.1, 622.0], [47.2, 622.0], [47.3, 622.0], [47.4, 622.0], [47.5, 624.0], [47.6, 624.0], [47.7, 624.0], [47.8, 624.0], [47.9, 624.0], [48.0, 625.0], [48.1, 625.0], [48.2, 625.0], [48.3, 625.0], [48.4, 625.0], [48.5, 630.0], [48.6, 630.0], [48.7, 630.0], [48.8, 630.0], [48.9, 630.0], [49.0, 630.0], [49.1, 630.0], [49.2, 630.0], [49.3, 630.0], [49.4, 630.0], [49.5, 632.0], [49.6, 632.0], [49.7, 632.0], [49.8, 632.0], [49.9, 632.0], [50.0, 642.0], [50.1, 642.0], [50.2, 642.0], [50.3, 642.0], [50.4, 642.0], [50.5, 650.0], [50.6, 650.0], [50.7, 650.0], [50.8, 650.0], [50.9, 650.0], [51.0, 653.0], [51.1, 653.0], [51.2, 653.0], [51.3, 653.0], [51.4, 653.0], [51.5, 655.0], [51.6, 655.0], [51.7, 655.0], [51.8, 655.0], [51.9, 655.0], [52.0, 655.0], [52.1, 655.0], [52.2, 655.0], [52.3, 655.0], [52.4, 655.0], [52.5, 656.0], [52.6, 656.0], [52.7, 656.0], [52.8, 656.0], [52.9, 656.0], [53.0, 659.0], [53.1, 659.0], [53.2, 659.0], [53.3, 659.0], [53.4, 659.0], [53.5, 659.0], [53.6, 659.0], [53.7, 659.0], [53.8, 659.0], [53.9, 659.0], [54.0, 661.0], [54.1, 661.0], [54.2, 661.0], [54.3, 661.0], [54.4, 661.0], [54.5, 665.0], [54.6, 665.0], [54.7, 665.0], [54.8, 665.0], [54.9, 665.0], [55.0, 670.0], [55.1, 670.0], [55.2, 670.0], [55.3, 670.0], [55.4, 670.0], [55.5, 670.0], [55.6, 670.0], [55.7, 670.0], [55.8, 670.0], [55.9, 670.0], [56.0, 672.0], [56.1, 672.0], [56.2, 672.0], [56.3, 672.0], [56.4, 672.0], [56.5, 678.0], [56.6, 678.0], [56.7, 678.0], [56.8, 678.0], [56.9, 678.0], [57.0, 680.0], [57.1, 680.0], [57.2, 680.0], [57.3, 680.0], [57.4, 680.0], [57.5, 684.0], [57.6, 684.0], [57.7, 684.0], [57.8, 684.0], [57.9, 684.0], [58.0, 684.0], [58.1, 684.0], [58.2, 684.0], [58.3, 684.0], [58.4, 684.0], [58.5, 685.0], [58.6, 685.0], [58.7, 685.0], [58.8, 685.0], [58.9, 685.0], [59.0, 686.0], [59.1, 686.0], [59.2, 686.0], [59.3, 686.0], [59.4, 686.0], [59.5, 689.0], [59.6, 689.0], [59.7, 689.0], [59.8, 689.0], [59.9, 689.0], [60.0, 690.0], [60.1, 690.0], [60.2, 690.0], [60.3, 690.0], [60.4, 690.0], [60.5, 694.0], [60.6, 694.0], [60.7, 694.0], [60.8, 694.0], [60.9, 694.0], [61.0, 699.0], [61.1, 699.0], [61.2, 699.0], [61.3, 699.0], [61.4, 699.0], [61.5, 701.0], [61.6, 701.0], [61.7, 701.0], [61.8, 701.0], [61.9, 701.0], [62.0, 703.0], [62.1, 703.0], [62.2, 703.0], [62.3, 703.0], [62.4, 703.0], [62.5, 704.0], [62.6, 704.0], [62.7, 704.0], [62.8, 704.0], [62.9, 704.0], [63.0, 710.0], [63.1, 710.0], [63.2, 710.0], [63.3, 710.0], [63.4, 710.0], [63.5, 710.0], [63.6, 710.0], [63.7, 710.0], [63.8, 710.0], [63.9, 710.0], [64.0, 713.0], [64.1, 713.0], [64.2, 713.0], [64.3, 713.0], [64.4, 713.0], [64.5, 714.0], [64.6, 714.0], [64.7, 714.0], [64.8, 714.0], [64.9, 714.0], [65.0, 721.0], [65.1, 721.0], [65.2, 721.0], [65.3, 721.0], [65.4, 721.0], [65.5, 727.0], [65.6, 727.0], [65.7, 727.0], [65.8, 727.0], [65.9, 727.0], [66.0, 730.0], [66.1, 730.0], [66.2, 730.0], [66.3, 730.0], [66.4, 730.0], [66.5, 732.0], [66.6, 732.0], [66.7, 732.0], [66.8, 732.0], [66.9, 732.0], [67.0, 732.0], [67.1, 732.0], [67.2, 732.0], [67.3, 732.0], [67.4, 732.0], [67.5, 733.0], [67.6, 733.0], [67.7, 733.0], [67.8, 733.0], [67.9, 733.0], [68.0, 742.0], [68.1, 742.0], [68.2, 742.0], [68.3, 742.0], [68.4, 742.0], [68.5, 745.0], [68.6, 745.0], [68.7, 745.0], [68.8, 745.0], [68.9, 745.0], [69.0, 760.0], [69.1, 760.0], [69.2, 760.0], [69.3, 760.0], [69.4, 760.0], [69.5, 765.0], [69.6, 765.0], [69.7, 765.0], [69.8, 765.0], [69.9, 765.0], [70.0, 769.0], [70.1, 769.0], [70.2, 769.0], [70.3, 769.0], [70.4, 769.0], [70.5, 775.0], [70.6, 775.0], [70.7, 775.0], [70.8, 775.0], [70.9, 775.0], [71.0, 780.0], [71.1, 780.0], [71.2, 780.0], [71.3, 780.0], [71.4, 780.0], [71.5, 781.0], [71.6, 781.0], [71.7, 781.0], [71.8, 781.0], [71.9, 781.0], [72.0, 788.0], [72.1, 788.0], [72.2, 788.0], [72.3, 788.0], [72.4, 788.0], [72.5, 792.0], [72.6, 792.0], [72.7, 792.0], [72.8, 792.0], [72.9, 792.0], [73.0, 801.0], [73.1, 801.0], [73.2, 801.0], [73.3, 801.0], [73.4, 801.0], [73.5, 802.0], [73.6, 802.0], [73.7, 802.0], [73.8, 802.0], [73.9, 802.0], [74.0, 803.0], [74.1, 803.0], [74.2, 803.0], [74.3, 803.0], [74.4, 803.0], [74.5, 804.0], [74.6, 804.0], [74.7, 804.0], [74.8, 804.0], [74.9, 804.0], [75.0, 804.0], [75.1, 804.0], [75.2, 804.0], [75.3, 804.0], [75.4, 804.0], [75.5, 817.0], [75.6, 817.0], [75.7, 817.0], [75.8, 817.0], [75.9, 817.0], [76.0, 819.0], [76.1, 819.0], [76.2, 819.0], [76.3, 819.0], [76.4, 819.0], [76.5, 823.0], [76.6, 823.0], [76.7, 823.0], [76.8, 823.0], [76.9, 823.0], [77.0, 825.0], [77.1, 825.0], [77.2, 825.0], [77.3, 825.0], [77.4, 825.0], [77.5, 830.0], [77.6, 830.0], [77.7, 830.0], [77.8, 830.0], [77.9, 830.0], [78.0, 843.0], [78.1, 843.0], [78.2, 843.0], [78.3, 843.0], [78.4, 843.0], [78.5, 845.0], [78.6, 845.0], [78.7, 845.0], [78.8, 845.0], [78.9, 845.0], [79.0, 849.0], [79.1, 849.0], [79.2, 849.0], [79.3, 849.0], [79.4, 849.0], [79.5, 853.0], [79.6, 853.0], [79.7, 853.0], [79.8, 853.0], [79.9, 853.0], [80.0, 870.0], [80.1, 870.0], [80.2, 870.0], [80.3, 870.0], [80.4, 870.0], [80.5, 871.0], [80.6, 871.0], [80.7, 871.0], [80.8, 871.0], [80.9, 871.0], [81.0, 874.0], [81.1, 874.0], [81.2, 874.0], [81.3, 874.0], [81.4, 874.0], [81.5, 875.0], [81.6, 875.0], [81.7, 875.0], [81.8, 875.0], [81.9, 875.0], [82.0, 876.0], [82.1, 876.0], [82.2, 876.0], [82.3, 876.0], [82.4, 876.0], [82.5, 877.0], [82.6, 877.0], [82.7, 877.0], [82.8, 877.0], [82.9, 877.0], [83.0, 884.0], [83.1, 884.0], [83.2, 884.0], [83.3, 884.0], [83.4, 884.0], [83.5, 884.0], [83.6, 884.0], [83.7, 884.0], [83.8, 884.0], [83.9, 884.0], [84.0, 884.0], [84.1, 884.0], [84.2, 884.0], [84.3, 884.0], [84.4, 884.0], [84.5, 887.0], [84.6, 887.0], [84.7, 887.0], [84.8, 887.0], [84.9, 887.0], [85.0, 889.0], [85.1, 889.0], [85.2, 889.0], [85.3, 889.0], [85.4, 889.0], [85.5, 892.0], [85.6, 892.0], [85.7, 892.0], [85.8, 892.0], [85.9, 892.0], [86.0, 897.0], [86.1, 897.0], [86.2, 897.0], [86.3, 897.0], [86.4, 897.0], [86.5, 898.0], [86.6, 898.0], [86.7, 898.0], [86.8, 898.0], [86.9, 898.0], [87.0, 905.0], [87.1, 905.0], [87.2, 905.0], [87.3, 905.0], [87.4, 905.0], [87.5, 905.0], [87.6, 905.0], [87.7, 905.0], [87.8, 905.0], [87.9, 905.0], [88.0, 907.0], [88.1, 907.0], [88.2, 907.0], [88.3, 907.0], [88.4, 907.0], [88.5, 911.0], [88.6, 911.0], [88.7, 911.0], [88.8, 911.0], [88.9, 911.0], [89.0, 914.0], [89.1, 914.0], [89.2, 914.0], [89.3, 914.0], [89.4, 914.0], [89.5, 935.0], [89.6, 935.0], [89.7, 935.0], [89.8, 935.0], [89.9, 935.0], [90.0, 945.0], [90.1, 945.0], [90.2, 945.0], [90.3, 945.0], [90.4, 945.0], [90.5, 946.0], [90.6, 946.0], [90.7, 946.0], [90.8, 946.0], [90.9, 946.0], [91.0, 946.0], [91.1, 946.0], [91.2, 946.0], [91.3, 946.0], [91.4, 946.0], [91.5, 946.0], [91.6, 946.0], [91.7, 946.0], [91.8, 946.0], [91.9, 946.0], [92.0, 947.0], [92.1, 947.0], [92.2, 947.0], [92.3, 947.0], [92.4, 947.0], [92.5, 959.0], [92.6, 959.0], [92.7, 959.0], [92.8, 959.0], [92.9, 959.0], [93.0, 987.0], [93.1, 987.0], [93.2, 987.0], [93.3, 987.0], [93.4, 987.0], [93.5, 995.0], [93.6, 995.0], [93.7, 995.0], [93.8, 995.0], [93.9, 995.0], [94.0, 1005.0], [94.1, 1005.0], [94.2, 1005.0], [94.3, 1005.0], [94.4, 1005.0], [94.5, 1011.0], [94.6, 1011.0], [94.7, 1011.0], [94.8, 1011.0], [94.9, 1011.0], [95.0, 1018.0], [95.1, 1018.0], [95.2, 1018.0], [95.3, 1018.0], [95.4, 1018.0], [95.5, 1028.0], [95.6, 1028.0], [95.7, 1028.0], [95.8, 1028.0], [95.9, 1028.0], [96.0, 1029.0], [96.1, 1029.0], [96.2, 1029.0], [96.3, 1029.0], [96.4, 1029.0], [96.5, 1030.0], [96.6, 1030.0], [96.7, 1030.0], [96.8, 1030.0], [96.9, 1030.0], [97.0, 1034.0], [97.1, 1034.0], [97.2, 1034.0], [97.3, 1034.0], [97.4, 1034.0], [97.5, 1040.0], [97.6, 1040.0], [97.7, 1040.0], [97.8, 1040.0], [97.9, 1040.0], [98.0, 1065.0], [98.1, 1065.0], [98.2, 1065.0], [98.3, 1065.0], [98.4, 1065.0], [98.5, 1087.0], [98.6, 1087.0], [98.7, 1087.0], [98.8, 1087.0], [98.9, 1087.0], [99.0, 1125.0], [99.1, 1125.0], [99.2, 1125.0], [99.3, 1125.0], [99.4, 1125.0], [99.5, 3901.0], [99.6, 3901.0], [99.7, 3901.0], [99.8, 3901.0], [99.9, 3901.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 39.0, "series": [{"data": [[1100.0, 1.0], [600.0, 39.0], [300.0, 20.0], [700.0, 23.0], [800.0, 28.0], [400.0, 25.0], [900.0, 14.0], [3900.0, 1.0], [500.0, 39.0], [1000.0, 10.0]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 3900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 152.0, "series": [{"data": [[0.0, 47.0]], "color": "#9ACD32", "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[1.0, 152.0]], "color": "yellow", "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 1.0]], "color": "orange", "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}, {"data": [], "color": "#FF6347", "isOverall": false, "label": "Requests in error", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.77493044E12, "maxY": 101.13567839195979, "series": [{"data": [[1.7749305E12, 1.0], [1.77493044E12, 101.13567839195979]], "isOverall": false, "label": "线程组-用户信息-关键接口", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7749305E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 312.0, "minX": 1.0, "maxY": 3901.0, "series": [{"data": [[2.0, 312.0], [10.0, 345.0], [18.0, 374.25], [26.0, 465.5], [30.0, 453.75], [32.0, 350.0], [34.0, 460.0], [39.0, 451.8], [41.0, 469.0], [42.0, 525.0], [44.0, 475.0], [47.0, 371.0], [46.0, 453.5], [49.0, 473.0], [48.0, 454.0], [51.0, 427.0], [50.0, 539.0], [53.0, 455.0], [52.0, 520.0], [55.0, 630.0], [54.0, 423.0], [57.0, 468.0], [56.0, 516.0], [59.0, 569.0], [60.0, 523.0], [63.0, 531.0], [62.0, 593.5], [67.0, 665.0], [66.0, 584.0], [65.0, 504.0], [64.0, 546.0], [70.0, 611.3333333333334], [74.0, 656.0], [73.0, 1125.0], [72.0, 549.0], [79.0, 546.5], [77.0, 560.3333333333334], [83.0, 679.3333333333334], [80.0, 659.0], [85.0, 655.0], [84.0, 655.0], [91.0, 632.0], [89.0, 596.0], [88.0, 662.6666666666666], [95.0, 530.0], [93.0, 577.0], [92.0, 538.0], [99.0, 732.0], [98.0, 1030.0], [97.0, 1087.0], [96.0, 1018.0], [102.0, 1065.0], [101.0, 583.5], [105.0, 838.0], [111.0, 745.0], [109.0, 542.0], [108.0, 664.6666666666666], [119.0, 874.0], [118.0, 1040.0], [117.0, 606.0], [116.0, 721.3333333333334], [122.0, 684.6666666666666], [134.0, 892.0], [133.0, 727.0], [132.0, 714.0], [131.0, 659.0], [130.0, 945.0], [129.0, 845.4285714285714], [142.0, 684.0], [141.0, 758.0], [140.0, 884.0], [137.0, 893.6666666666666], [151.0, 905.0], [149.0, 730.0], [147.0, 625.0], [146.0, 876.0], [159.0, 719.5], [157.0, 853.0], [156.0, 818.6], [166.0, 760.0], [165.0, 798.5], [163.0, 870.0], [162.0, 684.0], [161.0, 889.0], [160.0, 710.0], [172.0, 752.5], [175.0, 557.0], [174.0, 670.0], [173.0, 820.8571428571429], [177.0, 854.5], [179.0, 752.0], [181.0, 838.0], [182.0, 772.5], [183.0, 726.2], [180.0, 914.0], [178.0, 694.0], [176.0, 884.0], [184.0, 685.5], [1.0, 3901.0]], "isOverall": false, "label": "HTTP请求", "isController": false}, {"data": [[100.63499999999999, 671.0949999999998]], "isOverall": false, "label": "HTTP请求-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 184.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 7.0, "minX": 1.77493044E12, "maxY": 13472.3, "series": [{"data": [[1.7749305E12, 67.7], [1.77493044E12, 13472.3]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.7749305E12, 7.0], [1.77493044E12, 1393.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7749305E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 654.86432160804, "minX": 1.77493044E12, "maxY": 3901.0, "series": [{"data": [[1.7749305E12, 3901.0], [1.77493044E12, 654.86432160804]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7749305E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 654.7989949748743, "minX": 1.77493044E12, "maxY": 3901.0, "series": [{"data": [[1.7749305E12, 3901.0], [1.77493044E12, 654.7989949748743]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7749305E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 169.36683417085425, "minX": 1.77493044E12, "maxY": 3838.0, "series": [{"data": [[1.7749305E12, 3838.0], [1.77493044E12, 169.36683417085425]], "isOverall": false, "label": "HTTP请求", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7749305E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 304.0, "minX": 1.77493044E12, "maxY": 3901.0, "series": [{"data": [[1.7749305E12, 3901.0], [1.77493044E12, 1125.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.7749305E12, 3901.0], [1.77493044E12, 935.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.7749305E12, 3901.0], [1.77493044E12, 1087.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.7749305E12, 3901.0], [1.77493044E12, 1011.0]], "isOverall": false, "label": "95th percentile", "isController": false}, {"data": [[1.7749305E12, 3901.0], [1.77493044E12, 304.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.7749305E12, 3901.0], [1.77493044E12, 632.0]], "isOverall": false, "label": "Median", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7749305E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 596.0, "minX": 1.0, "maxY": 3901.0, "series": [{"data": [[1.0, 3901.0], [159.0, 596.0], [40.0, 791.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 159.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 596.0, "minX": 1.0, "maxY": 3901.0, "series": [{"data": [[1.0, 3901.0], [159.0, 596.0], [40.0, 790.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 159.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.3333333333333335, "minX": 1.77493044E12, "maxY": 3.3333333333333335, "series": [{"data": [[1.77493044E12, 3.3333333333333335]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.77493044E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.77493044E12, "maxY": 3.316666666666667, "series": [{"data": [[1.7749305E12, 0.016666666666666666], [1.77493044E12, 3.316666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.7749305E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.77493044E12, "maxY": 3.316666666666667, "series": [{"data": [[1.7749305E12, 0.016666666666666666], [1.77493044E12, 3.316666666666667]], "isOverall": false, "label": "HTTP请求-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7749305E12, "title": "Transactions Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.77493044E12, "maxY": 3.316666666666667, "series": [{"data": [[1.7749305E12, 0.016666666666666666], [1.77493044E12, 3.316666666666667]], "isOverall": false, "label": "Transaction-success", "isController": false}, {"data": [], "isOverall": false, "label": "Transaction-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.7749305E12, "title": "Total Transactions Per Second"}},
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

