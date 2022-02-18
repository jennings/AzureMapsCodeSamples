import * as atlas from "azure-maps-control";
import * as atlasRest from "azure-maps-rest";

//The URL to the store location data.
var storeLocationDataUrl = "data/ContosoCoffee.txt";

//An array of country region ISO2 values to limit searches to.
var countrySet = ["US", "CA", "GB", "FR", "DE", "IT", "ES", "NL", "DK"];

export function fetchStoreData(): Promise<Store[]> {
  return fetch(storeLocationDataUrl)
    .then((response) => response.text())
    .then((text) => {
      //Split the lines of the file.
      var lines = text.split("\n");

      //Grab the header row.
      var row = lines[0].split("\t");

      //Parse the header row and index each column, so that when our code for parsing each row is easier to follow.
      var header = {};
      var numColumns = row.length;
      var i;

      for (i = 0; i < row.length; i++) {
        header[row[i]] = i;
      }

      const stores: Store[] = [];
      for (i = 1; i < lines.length; i++) {
        row = lines[i].split("\t");

        //Ensure that the row has the right number of columns.
        if (row.length >= numColumns) {
          stores.push({
            Longitude: parseFloat(row[header["Longitude"]]),
            Latitude: parseFloat(row[header["Latitude"]]),
            AddressLine: row[header["AddressLine"]],
            City: row[header["City"]],
            Municipality: row[header["Municipality"]],
            AdminDivision: row[header["AdminDivision"]],
            Country: row[header["Country"]],
            PostCode: row[header["PostCode"]],
            Phone: row[header["Phone"]],
            StoreType: row[header["StoreType"]],
            IsWiFiHotSpot:
              row[header["IsWiFiHotSpot"]].toLowerCase() === "true"
                ? true
                : false,
            IsWheelchairAccessible:
              row[header["IsWheelchairAccessible"]].toLowerCase() === "true"
                ? true
                : false,
            Opens: parseInt(row[header["Opens"]]),
            Closes: parseInt(row[header["Closes"]]),
          });
        }
      }
      return stores;
    });
}

export function initializeQuery(credential: atlasRest.Credential) {
  //Use MapControlCredential to share authentication between a map control and the service module.
  const pipeline = atlasRest.MapsURL.newPipeline(credential);

  //Create an instance of the SearchURL client.
  const searchURL = new atlasRest.SearchURL(pipeline);

  return { pipeline, searchURL } as const;
}

export function searchFeatureByFuzzyQuery(
  searchURL: atlasRest.SearchURL,
  query: string
) {
  //Perform a fuzzy search on the users query.
  return (
    searchURL
      .searchFuzzy(atlasRest.Aborter.timeout(3000), query, {
        //Pass in the array of country ISO2 for which we want to limit the search to.
        countrySet: countrySet,
        view: "Auto",
      })
      //Parse the response into GeoJSON so that the map can understand.
      .then((results) => results.geojson.getFeatures())
      .then((data) => {
        console.log("Received search data", data);
        if (data.features.length > 0) {
          return data.features[0];
        } else {
          return null;
        }
      })
  );
}

export function getStoresWithinDistance(
  maxDistance: number,
  position: GeoJSON.Position,
  stores: Store[]
) {
  return stores.filter((store) => {
    const distance = atlas.math.getDistanceTo(position, [
      store.Longitude,
      store.Latitude,
    ], "miles");
    return distance < maxDistance;
  });
}

export interface Store {
  Latitude: number;
  Longitude: number;
  AddressLine: string;
  City: string;
  Municipality: string;
  AdminDivision: string;
  Country: string;
  PostCode: string;
  Phone: string;
  StoreType: string;
  IsWiFiHotSpot: boolean;
  IsWheelchairAccessible: boolean;
  Opens: number;
  Closes: number;
}
