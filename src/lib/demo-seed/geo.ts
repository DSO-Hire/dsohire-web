/**
 * Static metro coordinates for the demo seed. We set dso_locations'
 * latitude/longitude and candidates' desired_location_points directly from
 * these so the PracticeFit engine's location dimension scores without any live
 * geocoding (resolveDesiredLocationPoints reuses stored points). Approximate
 * city centroids — precise enough for the distance-based location score.
 */

export interface Metro {
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
}

export const METROS: Record<string, Metro> = {
  // Hero (Bridgeway) — Colorado Front Range
  denver: { city: "Denver", state: "CO", zip: "80202", lat: 39.7392, lng: -104.9903 },
  aurora: { city: "Aurora", state: "CO", zip: "80012", lat: 39.7294, lng: -104.8319 },
  lakewood: { city: "Lakewood", state: "CO", zip: "80226", lat: 39.7047, lng: -105.0814 },
  boulder: { city: "Boulder", state: "CO", zip: "80302", lat: 40.015, lng: -105.2705 },
  fortcollins: { city: "Fort Collins", state: "CO", zip: "80521", lat: 40.5853, lng: -105.0844 },
  coloradosprings: { city: "Colorado Springs", state: "CO", zip: "80903", lat: 38.8339, lng: -104.8214 },
  arvada: { city: "Arvada", state: "CO", zip: "80002", lat: 39.8028, lng: -105.0875 },
  centennial: { city: "Centennial", state: "CO", zip: "80112", lat: 39.5807, lng: -104.8772 },
  thornton: { city: "Thornton", state: "CO", zip: "80229", lat: 39.868, lng: -104.9719 },
  westminster: { city: "Westminster", state: "CO", zip: "80031", lat: 39.8367, lng: -105.0372 },
  greeley: { city: "Greeley", state: "CO", zip: "80631", lat: 40.4233, lng: -104.7091 },
  longmont: { city: "Longmont", state: "CO", zip: "80501", lat: 40.1672, lng: -105.1019 },
  loveland: { city: "Loveland", state: "CO", zip: "80537", lat: 40.3978, lng: -105.075 },
  pueblo: { city: "Pueblo", state: "CO", zip: "81003", lat: 38.2545, lng: -104.6091 },
  castlerock: { city: "Castle Rock", state: "CO", zip: "80104", lat: 39.3722, lng: -104.8561 },
  parker: { city: "Parker", state: "CO", zip: "80134", lat: 39.5186, lng: -104.7614 },
  littleton: { city: "Littleton", state: "CO", zip: "80120", lat: 39.6133, lng: -105.0166 },
  broomfield: { city: "Broomfield", state: "CO", zip: "80020", lat: 39.9205, lng: -105.0867 },

  // Growth (Lakeshore) — Wisconsin
  madison: { city: "Madison", state: "WI", zip: "53703", lat: 43.0731, lng: -89.4012 },
  milwaukee: { city: "Milwaukee", state: "WI", zip: "53202", lat: 43.0389, lng: -87.9065 },
  greenbay: { city: "Green Bay", state: "WI", zip: "54301", lat: 44.5133, lng: -88.0133 },
  appleton: { city: "Appleton", state: "WI", zip: "54911", lat: 44.2619, lng: -88.4154 },

  // Solo (Cedarwood) — Idaho
  boise: { city: "Boise", state: "ID", zip: "83702", lat: 43.615, lng: -116.2023 },

  // Enterprise (Summit) — multi-state (AZ/NV/TX/NM)
  phoenix: { city: "Phoenix", state: "AZ", zip: "85004", lat: 33.4484, lng: -112.074 },
  tucson: { city: "Tucson", state: "AZ", zip: "85701", lat: 32.2226, lng: -110.9747 },
  mesa: { city: "Mesa", state: "AZ", zip: "85201", lat: 33.4152, lng: -111.8315 },
  scottsdale: { city: "Scottsdale", state: "AZ", zip: "85251", lat: 33.4942, lng: -111.9261 },
  lasvegas: { city: "Las Vegas", state: "NV", zip: "89101", lat: 36.1699, lng: -115.1398 },
  reno: { city: "Reno", state: "NV", zip: "89501", lat: 39.5296, lng: -119.8138 },
  albuquerque: { city: "Albuquerque", state: "NM", zip: "87102", lat: 35.0844, lng: -106.6504 },
  elpaso: { city: "El Paso", state: "TX", zip: "79901", lat: 31.7619, lng: -106.485 },
  austin: { city: "Austin", state: "TX", zip: "78701", lat: 30.2672, lng: -97.7431 },
  sanantonio: { city: "San Antonio", state: "TX", zip: "78205", lat: 29.4241, lng: -98.4936 },

  // Extra Scale (Riverstone) — Oregon / SW Washington
  portland: { city: "Portland", state: "OR", zip: "97204", lat: 45.5152, lng: -122.6784 },
  eugene: { city: "Eugene", state: "OR", zip: "97401", lat: 44.0521, lng: -123.0868 },
  salem: { city: "Salem", state: "OR", zip: "97301", lat: 44.9429, lng: -123.0351 },
  bend: { city: "Bend", state: "OR", zip: "97701", lat: 44.0582, lng: -121.3153 },
  vancouverwa: { city: "Vancouver", state: "WA", zip: "98660", lat: 45.6387, lng: -122.6615 },
  gresham: { city: "Gresham", state: "OR", zip: "97030", lat: 45.5001, lng: -122.4302 },
  hillsboro: { city: "Hillsboro", state: "OR", zip: "97123", lat: 45.5229, lng: -122.9898 },
};

export type MetroKey = keyof typeof METROS;
