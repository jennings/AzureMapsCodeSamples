﻿import * as atlas from "azure-maps-control";
import * as atlasRest from "azure-maps-rest";
import {
  fetchStoreData,
  getStoresWithinDistance,
  initializeQuery,
  searchFeatureByFuzzyQuery,
  Store,
} from "./query";
import type { Pipeline } from "azure-maps-rest";
import { GeoJsonGeometryTypes } from "geojson";

//The maximum zoom level to cluster data point data on the map.
var maxClusterZoomLevel = 11;

//The URL to the icon image.
var iconImageUrl = "images/CoffeeIcon.png";

var map: atlas.Map,
  popup,
  datasource,
  iconLayer,
  centerMarker,
  searchURL: atlasRest.SearchURL;

var listItemTemplate =
  '<div class="listItem" onclick="itemSelected(\'{id}\')"><div class="listItem-title">{title}</div>{city}<br />Open until {closes}<br />{distance} miles away</div>';

function initialize() {
  //Initialize a map instance.
  map = new atlas.Map("myMap", {
    center: [-90, 40],
    zoom: 2,
    view: "Auto",

    //Add authentication details for connecting to Azure Maps.
    authOptions: {
      clientId: "2831aa81-2e29-49e8-b45a-3b694909676e", //Your Azure Maps Azure Active Directory account client id.

      //authType: "subscriptionKey",
      authType: atlas.AuthenticationType.subscriptionKey,
      subscriptionKey: "3fFAQe0HqVuSKQI1-G9lDU2_lbFeqZqrCDvKjVyt5A0",
    },
  });

  //Create a popup but leave it closed so we can update it and display it later.
  popup = new atlas.Popup();

  const credential = new atlasRest.MapControlCredential(map);
  const queryData = initializeQuery(credential);
  searchURL = queryData.searchURL;

  //If the user presses the search button, geocode the value they passed in.
  document.getElementById("searchBtn")!.onclick = performSearch;

  //If the user presses enter in the search textbox, perform a search.
  document.getElementById("searchTbx")!.onkeyup = function (e) {
    if (e.keyCode === 13) {
      performSearch();
    }
  };

  //If the user presses the My Location button, use the geolocation API to get the users location and center/zoom the map to that location.
  document.getElementById("myLocationBtn")!.onclick = setMapToUserLocation;

  //Wait until the map resources are ready.
  map.events.add("ready", function () {
    //Add the zoom control to the map.
    map.controls.add(new atlas.control.ZoomControl(), {
      position: atlas.ControlPosition.TopRight,
    });

    //Add an HTML marker to the map to indicate the center used for searching.
    centerMarker = new atlas.HtmlMarker({
      htmlContent: '<div class="mapCenterIcon"></div>',
      position: map.getCamera().center,
    });

    map.markers.add(centerMarker);

    //Create a data source and add it to the map and enable clustering.
    datasource = new atlas.source.DataSource(undefined, {
      cluster: true,
      clusterMaxZoom: maxClusterZoomLevel - 1,
    });

    map.sources.add(datasource);

    //Load all the store data now that the data source has been defined.
    loadStoreData();

    //Create a bubble layer for rendering clustered data points.
    var clusterBubbleLayer = new atlas.layer.BubbleLayer(
      datasource,
      undefined,
      {
        radius: 12,
        color: "#007faa",
        strokeColor: "white",
        strokeWidth: 2,
        filter: ["has", "point_count"], //Only render data points which have a point_count property, which clusters do.
      }
    );

    //Create a symbol layer to render the count of locations in a cluster.
    var clusterLabelLayer = new atlas.layer.SymbolLayer(datasource, undefined, {
      iconOptions: {
        image: "none", //Hide the icon image.
      },
      textOptions: {
        textField: ["get", "point_count_abbreviated"],
        size: 12,
        font: ["StandardFont-Bold"],
        offset: [0, 0.4],
        color: "white",
      },
    });

    map.layers.add([clusterBubbleLayer, clusterLabelLayer]);

    //Load a custom image icon into the map resources.
    map.imageSprite.add("myCustomIcon", iconImageUrl).then(function () {
      //Create a layer to render a coffe cup symbol above each bubble for an individual location.
      iconLayer = new atlas.layer.SymbolLayer(datasource, undefined, {
        iconOptions: {
          //Pass in the id of the custom icon that was loaded into the map resources.
          image: "myCustomIcon",

          //Optionally scale the size of the icon.
          font: ["SegoeUi-Bold"],

          //Anchor the center of the icon image to the coordinate.
          anchor: "center",

          //Allow the icons to overlap.
          allowOverlap: true,
        },
        filter: ["!", ["has", "point_count"]], //Filter out clustered points from this layer.
      });

      map.layers.add(iconLayer);

      //When the mouse is over the cluster and icon layers, change the cursor to be a pointer.
      map.events.add("mouseover", [clusterBubbleLayer, iconLayer], function () {
        map.getCanvasContainer().style.cursor = "pointer";
      });

      //When the mouse leaves the item on the cluster and icon layers, change the cursor back to the default which is grab.
      map.events.add("mouseout", [clusterBubbleLayer, iconLayer], function () {
        map.getCanvasContainer().style.cursor = "grab";
      });

      //Add a click event to the cluster layer. When someone clicks on a cluster, zoom into it by 2 levels.
      map.events.add("click", clusterBubbleLayer, function (e) {
        map.setCamera({
          center: e.position,
          zoom: map.getCamera().zoom! + 2,
        });
      });

      //Add a click event to the icon layer and show the shape that was clicked.
      map.events.add("click", iconLayer, function (e: atlas.MapMouseEvent) {
        showPopup(e.shapes![0]);
      });

      //Add an event to monitor when the map has finished moving.
      map.events.add("render", function () {
        //Give the map a chance to move and render data before updating the list.
        updateListItems();
      });
    });
  });
}

let loadedStores: Store[];

function loadStoreData() {
  //Download the store location data.
  fetchStoreData().then(function (stores) {
    loadedStores = stores;

    //Parse the Tab delimited file data into GeoJSON features.
    const features: atlas.data.Feature<atlas.data.Point, Store>[] = [];

    for (const store of stores) {
      features.push(
        new atlas.data.Feature(
          new atlas.data.Point([store.Longitude, store.Latitude]),
          store
        )
      );
    }

    //Add the features to the data source.
    datasource.add(features);

    //Initially update the list items.
    updateListItems();
  });
}

function performSearch() {
  var query = (document.getElementById("searchTbx") as HTMLInputElement).value;
  searchFeatureByFuzzyQuery(searchURL, query).then((feature) => {
    if (feature != null) {
      // Calculating nearby stores without the map
      const storesWithin25Units = getStoresWithinDistance(
        25,
        feature.geometry.coordinates,
        loadedStores
      );
      console.log("Nearby stores:", storesWithin25Units);

      //Set the camera to the bounds of the results.
      map.setCamera({
        bounds: feature.bbox,
        padding: 40,
      });
    } else {
      document.getElementById("listPanel")!.innerHTML =
        '<div class="statusMessage">Unable to find the location you searched for.</div>';
    }
  });
}

function setMapToUserLocation() {
  //Request the user's location.
  navigator.geolocation.getCurrentPosition(
    function (position) {
      //Convert the geolocation API position into a longitude/latitude position value the map can understand and center the map over it.
      map.setCamera({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: maxClusterZoomLevel + 1,
      });
    },
    function (error) {
      //If an error occurs when trying to access the users position information, display an error message.
      switch (error.code) {
        case error.PERMISSION_DENIED:
          alert("User denied the request for Geolocation.");
          break;
        case error.POSITION_UNAVAILABLE:
          alert("Position information is unavailable.");
          break;
        case error.TIMEOUT:
          alert("The request to get user position timed out.");
          break;
        // @ts-expect-error
        case error.UNKNOWN_ERROR:
          alert("An unknown error occurred.");
          break;
      }
    }
  );
}

function updateListItems() {
  //Hide the center marker.
  centerMarker.setOptions({
    visible: false,
  });

  //Get the current camera/view information for the map.
  var camera = map.getCamera();

  var listPanel = document.getElementById("listPanel")!;

  //Check to see if the user is zoomed out a lot. If they are, tell them to zoom in closer, perform a search or press the My Location button.
  if (camera.zoom! < maxClusterZoomLevel) {
    //Close the popup as clusters may be displayed on the map.
    popup.close();

    listPanel.innerHTML =
      '<div class="statusMessage">Search for a location, zoom the map, or press the "My Location" button to see individual locations.</div>';
  } else {
    //Update the location of the centerMarker.
    centerMarker.setOptions({
      position: camera.center,
      visible: true,
    });

    //List the ten closest locations in the side panel.
    var html: string[] = [];

    /*
            Generating HTML for each item that looks like this:
         
            <div class="listItem" onclick="itemSelected('id')">
                <div class="listItem-title">1 Microsoft Way</div>
                Redmond, WA 98052<br />
                Open until 9:00 PM<br />
                0.7 miles away
            </div>
         */

    //Get all the shapes that have been rendered in the bubble layer.
    var data = map.layers
      .getRenderedShapes(map.getCamera().bounds, [iconLayer])
      .filter((x): x is atlas.Shape => x instanceof atlas.Shape);

    //Create an index of the distances of each shape.
    var distances = {};

    data.forEach(function (shape) {
      if (shape instanceof atlas.Shape) {
        //Calculate the distance from the center of the map to each shape and store in the index. Round to 2 decimals.
        distances[shape.getId()] =
          Math.round(
            atlas.math.getDistanceTo(
              camera.center!,
              // @ts-expect-error
              shape.getCoordinates(),
              "miles"
            ) * 100
          ) / 100;
      }
    });

    //Sort the data by distance.
    data.sort(function (x, y) {
      return distances[x.getId()] - distances[y.getId()];
    });

    data.forEach(function (shape) {
      const properties = shape.getProperties();

      html.push(
        '<div class="listItem" onclick="itemSelected(\'',
        `${shape.getId()}`,
        '\')"><div class="listItem-title">',
        properties["AddressLine"],
        "</div>",

        //Get a formatted address line 2 value that consists of City, Municipality, AdminDivision, and PostCode.
        getAddressLine2(properties),
        "<br />",

        //Convert the closing time into a nicely formated time.
        getOpenTillTime(properties),
        "<br />",

        //Get the distance of the shape.
        distances[shape.getId()],
        " miles away</div>"
      );
    });

    listPanel.innerHTML = html.join("");

    //Scroll to the top of the list panel incase the user has scrolled down.
    listPanel.scrollTop = 0;
  }
}

//This converts a time in 2400 format into an AM/PM time or noon/midnight string.
function getOpenTillTime(properties) {
  var time = properties["Closes"];
  var t = time / 100;

  var sTime;

  if (time === 1200) {
    sTime = "noon";
  } else if (time === 0 || time === 2400) {
    sTime = "midnight";
  } else {
    sTime = Math.round(t) + ":";

    //Get the minutes.
    t = (t - Math.round(t)) * 100;

    if (t === 0) {
      sTime += "00";
    } else if (t < 10) {
      sTime += "0" + t;
    } else {
      sTime += Math.round(t);
    }

    if (time < 1200) {
      sTime += " AM";
    } else {
      sTime += " PM";
    }
  }

  return "Open until " + sTime;
}

//When a user clicks on a result in the side panel, look up the shape by its id value and show popup.
function itemSelected(id) {
  //Get the shape from the data source using it's id.
  var shape = datasource.getShapeById(id);
  showPopup(shape);

  //Center the map over the shape on the map.
  var center = shape.getCoordinates();
  var offset;

  //If the map is less than 700 pixels wide, then the layout is set for small screens.
  if (map.getCanvas().width < 700) {
    //When the map is small, offset the center of the map relative to the shape so that there is room for the popup to appear.
    offset = [0, -80];
  }

  map.setCamera({
    center: center,
    centerOffset: offset,
  });
}

function showPopup(shape) {
  var properties = shape.getProperties();

  /*
        Generating HTML for the popup that looks like this:

         <div class="storePopup">
                <div class="popupTitle">
                    3159 Tongass Avenue
                    <div class="popupSubTitle">Ketchikan, AK 99901</div>
                </div>
                <div class="popupContent">
                    Open until 22:00 PM<br/>
                    <img title="Phone Icon" src="images/PhoneIcon.png">
                    <a href="tel:1-800-XXX-XXXX">1-800-XXX-XXXX</a>
                    <br>Amenities:
                    <img title="Wi-Fi Hotspot" src="images/WiFiIcon.png">
                    <img title="Wheelchair Accessible" src="images/WheelChair-small.png">
                </div>
            </div>
     */

  //Calculate the distance from the center of the map to the shape in miles, round to 2 decimals.
  var distance =
    Math.round(
      atlas.math.getDistanceTo(
        map.getCamera().center!,
        shape.getCoordinates(),
        "miles"
      ) * 100
    ) / 100;

  var html = ['<div class="storePopup">'];

  html.push(
    '<div class="popupTitle">',
    properties["AddressLine"],
    '<div class="popupSubTitle">',
    getAddressLine2(properties),
    '</div></div><div class="popupContent">',

    //Convert the closing time into a nicely formated time.
    getOpenTillTime(properties),

    //Add the distance information.
    "<br/>",
    `${distance}`,
    " miles away",
    '<br /><img src="images/PhoneIcon.png" title="Phone Icon"/><a href="tel:',
    properties["Phone"],
    '">',
    properties["Phone"],
    "</a>"
  );

  if (properties["IsWiFiHotSpot"] || properties["IsWheelchairAccessible"]) {
    html.push("<br/>Amenities: ");

    if (properties["IsWiFiHotSpot"]) {
      html.push('<img src="images/WiFiIcon.png" title="Wi-Fi Hotspot"/>');
    }

    if (properties["IsWheelchairAccessible"]) {
      html.push(
        '<img src="images/WheelChair-small.png" title="Wheelchair Accessible"/>'
      );
    }
  }

  html.push("</div></div>");

  //Update the content and position of the popup for the specified shape information.
  popup.setOptions({
    //Create a table from the properties in the feature.
    content: html.join(""),
    position: shape.getCoordinates(),
  });

  //Open the popup.
  popup.open(map);
}

//Creates an addressLine2 string consisting of City, Municipality, AdminDivision, and PostCode.
function getAddressLine2(properties) {
  var html = [properties["City"]];

  if (properties["Municipality"]) {
    html.push(", ", properties["Municipality"]);
  }

  if (properties["AdminDivision"]) {
    html.push(", ", properties["AdminDivision"]);
  }

  if (properties["PostCode"]) {
    html.push(" ", properties["PostCode"]);
  }

  return html.join("");
}

//Initialize the application when the page is loaded.
window.onload = initialize;
