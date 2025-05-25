<template>
    <div ref="mapRoot" style="width: 100%; height: 100%"></div>
</template>

<script>
import { onMounted, ref } from "vue";
import proj4 from "proj4";
import { register } from "ol/proj/proj4";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import "ol/ol.css";

proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs");
register(proj4);

export default {
    name: "OpenLayersMap",
    setup() {
        const mapRoot = ref(null);

        onMounted(() => {
            new Map({
                target: mapRoot.value,
                layers: [
                    new TileLayer({
                        source: new OSM(),
                    }),
                ],
                view: new View({
                    center: [0, 0], // ggf. anpassen
                    zoom: 2,
                }),
            });
        });

        return { mapRoot };
    },
};
</script>
