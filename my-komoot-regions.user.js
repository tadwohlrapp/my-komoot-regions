// ==UserScript==
// @name            My Komoot Regions
// @description     Show me my unlocked regions on Komoot!
// @namespace       https://github.com/tadwohlrapp
// @author          Tad Wohlrapp
// @version         0.0.1
// @license         MIT
// @homepageURL     https://github.com/tadwohlrapp/my-komoot-regions
// @supportURL      https://github.com/tadwohlrapp/my-komoot-regions/issues
// @match           https://www.komoot.de/product/regions
// @grant           GM_xmlhttpRequest
// @run-at          document-idle
// ==/UserScript==

(function () {
  'use strict'

  unsafeWindow.komootMap = null
  let features = []
  let globalCounter = 0
  let getMapTries = 0

  function findObjects(object, maxTries, stopAtPrefix) {
    let tries = 0
    const visited = []
    const queue = [{
      object: object,
      path: [],
    }]

    while (queue.length > 0) {
      const next = queue.shift()

      if (!next.object || visited.includes(next.object)) {
        continue
      }

      if (next.object._mapId) {
        return next.object
      }

      visited.push(next.object)

      for (const property of Object.getOwnPropertyNames(next.object)) {
        if (stopAtPrefix && property.startsWith(stopAtPrefix)) {
          return next.object[property];
        }
        queue.push({
          object: next.object[property],
          path: [...next.path, property],
        })
      }
      if (tries++ > maxTries) {
        return null
      }
    }
    return null
  }

  function getMap() {
    const elements = document.getElementsByTagName('*')
    for (const el of elements) {
      if ((el.className && el.className.toString().toLowerCase().includes("map"))) {
        const react = findObjects(el, 5000, '__reactInternal')
        if (react) {
          const map = findObjects(react, 25000)
          if (map && map instanceof Object) {
            if (!unsafeWindow.komootMap) {
              console.log('Found map!')
              unsafeWindow.komootMap = map
              waitForGlobal()
            }
            break
          } else if (getMapTries < 10) {
            getMapTries++
            console.log(`Looking for map... (Attempt ${getMapTries}/10)`)
            setTimeout(function () {
              getMap()
            }, 500)
          }
        } else if (getMapTries < 10) {
          getMapTries++
          console.log(`Looking for map... (Attempt ${getMapTries}/10)`)
          setTimeout(function () {
            getMap()
          }, 500)
        }
      }
    }
  }

  function waitForGlobal() {
    if (unsafeWindow.kmtBoot.getProps().packages.models) {
      showMyFreeRegions()
      findPurchasedRegions()
    } else {
      setTimeout(function () {
        waitForGlobal()
      }, 500)
    }
  }

  function showMyFreeRegions() {
    const freeRegionsCount = unsafeWindow.kmtBoot.getProps().freeProducts.length
    let additionalText = `<br>Aktuell kannst du leider keine weiteren kostenlosen Regionen freischalten.`
    if (freeRegionsCount > 0) {
      additionalText = `<br>Du kannst noch <strong>${freeRegionsCount}</strong> Region${freeRegionsCount != 1 ? 'en' : ''} kostenlos freischalten! 🎉`
    }
    document.querySelector('h2').innerHTML += additionalText
  }

  function findPurchasedRegions() {
    const packages = unsafeWindow.kmtBoot.getProps().packages.models
    const myRegionIds = getMyRegionIds(packages)
    console.log("Purchased regions:", myRegionIds)

    myRegionIds.forEach(regionId => {
      getGeometry(regionId, myRegionIds.length)
    })
  }

  function getMyRegionIds(packages) {
    let regionIds = []

    const regionsArr = Array.from(packages)
    regionsArr.forEach(region => {
      regionIds.push(region.attributes.region.id)
    })
    return regionIds
  }

  function getGeometry(regionId, totalRegions) {
    GM_xmlhttpRequest({
      method: 'GET',
      url: `https://www.komoot.de/product/regions/?region=${regionId}`,
      data: false,
      headers: { "onlyprops": "true" },
      responseType: 'json',
      onload: resp => {

        if (resp.response) {
          const { id, name, groupId: type, geometry } = resp.response.regions[0]
          buildGeoObject({ id, name, type, geometry })
          globalCounter++
          if (globalCounter === totalRegions) {
            console.log('done fetching')
            drawOnMap(features)
          }
        }
      },
    })
  }

  function buildGeoObject({ id, name, type, geometry }) {
    const geometryArr = geometry[0]
    const coordinates = []
    geometryArr.forEach(item => {
      const latLng = []
      latLng.push(item.lng)
      latLng.push(item.lat)
      coordinates.push(latLng)
    })

    const geoJson = {
      "type": "Feature",
      "properties": {
        "id": id,
        "name": name,
        "region": type === 1
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [coordinates]
      }
    }

    features.push(geoJson)
  }

  function drawOnMap(features) {
    if (unsafeWindow.komootMap) {
      const geoJsonData = {
        "type": "FeatureCollection",
        "features": features
      }

      const source = unsafeWindow.komootMap.getSource('TAD_my_regions')
      if (source) {
        source.setData(data)
      } else {
        unsafeWindow.komootMap.addSource('TAD_my_regions', {
          type: 'geojson',
          data: geoJsonData
        })
      }

      unsafeWindow.komootMap.addLayer({
        'id': 'TAD-my-regions',
        'type': 'fill',
        'source': 'TAD_my_regions',
        'layout': {},
        'paint': {
          'fill-color': [
            "case",
            ["boolean", ["get", "region"]],
            ["rgba", 16, 134, 232, 1],
            ["rgba", 245, 82, 94, 1]
          ],
          'fill-opacity': 0.5
        }
      }, "komoot-selected-marker")
    }
  }

  getMap()

})()
