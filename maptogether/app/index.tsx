import React, { useRef, useState } from 'react';
import { View, StyleSheet, Button, Alert, Linking } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import * as Location from 'expo-location';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import * as Localization from 'expo-localization';

const id = uuidv4();
console.log(id);
// 使用环境变量传入 Key（在 app.config.* 或 .env 里配置 EXPO_PUBLIC_*）
const PLACES_KEY = process.env.EXPO_PUBLIC_PLACES_KEY || '';
const DIRECTIONS_KEY = process.env.EXPO_PUBLIC_DIRECTIONS_KEY || PLACES_KEY; // 同一个 Key 也可

// 语言代码，优先使用系统语言；无法获取时退回英文
const LOCALE = (Localization.getLocales?.()[0]?.languageTag || 'en').replace('_', '-');

type LatLng = { latitude: number; longitude: number };

export default function HomeScreen() {
  const mapRef = useRef<MapView | null>(null);

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);

  // 定位到我（前台）
  const locateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要定位权限', '请在系统设置中开启定位权限。');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = loc.coords;
    const me = { latitude, longitude };
    setOrigin(me);
    mapRef.current?.animateCamera({ center: me, zoom: 15 }, { duration: 400 });
  };

  // Google 导航深链（完整逐向导航交给 Google Maps）
  const openGoogleNav = () => {
    if (!origin || !destination) return;
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      (waypoints.length
        ? `&waypoints=${waypoints
            .map(p => `${p.latitude},${p.longitude}`)
            .join('|')}`
        : '') +
      `&travelmode=driving`;
    Linking.openURL(url);
  };

  // 点击地图内置 POI：用 place_id 拉取详情（名称/地址），并提供快捷设置为终点
  const handlePoiClick = async (e: any) => {
    try {
      const pid = e?.nativeEvent?.placeId;
      if (!pid || !PLACES_KEY) return;
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
          pid
        )}&language=${LOCALE}&key=${PLACES_KEY}`
      );
      const json = await res.json();
      const result = json?.result;
      if (!result) return;
      const name = result.name || '未知地点';
      const addr = result.formatted_address || result.vicinity || '';
      const loc = result.geometry?.location;
      Alert.alert(name, addr, [
        { text: '设为起点', onPress: () => setOrigin({ latitude: loc.lat, longitude: loc.lng }) },
        { text: '设为经停', onPress: () => setWaypoints(prev => [...prev, { latitude: loc.lat, longitude: loc.lng }]) },
        { text: '设为终点', onPress: () => setDestination({ latitude: loc.lat, longitude: loc.lng }) },
        { text: '取消', style: 'cancel' },
      ]);
    } catch (err) {
      // 静默失败即可
    }
  };

  // 根据路线自动包络镜头
  const onDirectionsReady = (result: any) => {
    if (!mapRef.current) return;
    mapRef.current.fitToCoordinates(result.coordinates, {
      edgePadding: { top: 60, right: 60, bottom: 140, left: 60 },
      animated: true,
    });
  };

  return (
    <View style={styles.container}>
      {/* 顶部：Google 风格自动补全（起点/终点） */}
      <View style={styles.searchWrap}>
        <GooglePlacesAutocomplete
          placeholder="搜索起点"
          fetchDetails
          predefinedPlaces={[]}
          predefinedPlacesAlwaysVisible={false}
          textInputProps={{}}
          enablePoweredByContainer={false}
          query={{ key: PLACES_KEY, language: LOCALE }}
          onPress={(_, details: any) => {
            const { lat, lng } = details.geometry.location;
            const p = { latitude: lat, longitude: lng };
            setOrigin(p);
            mapRef.current?.animateCamera({ center: p, zoom: 14 }, { duration: 300 });
          }}
          styles={{ container: { flex: 0, marginBottom: 6 }, textInput: { height: 42, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10 } }}
        />
        <GooglePlacesAutocomplete
          placeholder="搜索终点"
          fetchDetails
          predefinedPlaces={[]}
          predefinedPlacesAlwaysVisible={false}
          textInputProps={{}}
          enablePoweredByContainer={false}
          query={{ key: PLACES_KEY, language: LOCALE }}
          onPress={(_, details: any) => {
            const { lat, lng } = details.geometry.location;
            const p = { latitude: lat, longitude: lng };
            setDestination(p);
            mapRef.current?.animateCamera({ center: p, zoom: 14 }, { duration: 300 });
          }}
          styles={{ container: { flex: 0 }, textInput: { height: 42, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10 } }}
        />
      </View>

      {/* 地图主体 */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider="google"
        showsUserLocation
        onPoiClick={handlePoiClick}
        initialRegion={{
          latitude: 39.9042,
          longitude: 116.4074,
          latitudeDelta: 0.2,
          longitudeDelta: 0.2,
        }}
      >
        {origin && <Marker coordinate={origin} title="起点" />}
        {destination && <Marker coordinate={destination} title="终点" />}

        {/* 仅在配置了 Directions Key 时绘制 Google 线路 */}
        {DIRECTIONS_KEY && origin && destination && (
          <MapViewDirections
            origin={origin}
            destination={destination}
            waypoints={waypoints}
            apikey={DIRECTIONS_KEY}
            mode="DRIVING"
            strokeWidth={5}
            onReady={onDirectionsReady}
          />
        )}
      </MapView>

      {/* 底部操作条：到我 / 开始导航 */}
      <View style={styles.bottomBar}>
        <View style={styles.btn}>
          <Button title="到我" onPress={locateMe} />
        </View>
        <View style={styles.btn}>
          <Button title="开始导航（Google）" onPress={openGoogleNav} disabled={!origin || !destination} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  searchWrap: { position: 'absolute', top: 50, left: 12, right: 12, zIndex: 10 },
  bottomBar: { position: 'absolute', left: 12, right: 12, bottom: 32, flexDirection: 'row', justifyContent: 'space-between' },
  btn: { flex: 1, marginHorizontal: 4 },
});