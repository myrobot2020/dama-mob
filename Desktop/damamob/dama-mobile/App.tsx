import React, { useState } from 'react';
import { StyleSheet, View, SafeAreaView, Platform, TextInput, Text, TouchableOpacity, KeyboardAvoidingView } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  const [ip, setIp] = useState('192.168.1.5');
  const [showSettings, setShowSettings] = useState(true);

  const url = ip.startsWith('http') ? ip : `http://${ip}:8031`;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {showSettings ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.settings}>
          <View style={styles.card}>
            <Text style={styles.title}>DAMA Mobile</Text>
            <Text style={styles.label}>Server Address (Laptop IP):</Text>
            <TextInput
              style={styles.input}
              value={ip}
              onChangeText={setIp}
              placeholder="e.g. 192.168.1.10"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.button} onPress={() => setShowSettings(false)}>
              <Text style={styles.buttonText}>Connect & Launch</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>Tip: To change the IP later, restart the app or long-press the screen.</Text>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.webviewContainer}>
          <WebView
            source={{ uri: url }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onLongPress={() => setShowSettings(true)}
          />
          <TouchableOpacity style={styles.miniFab} onPress={() => setShowSettings(true)}>
             <Text style={{fontSize: 16}}>⚙️</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfbf7' },
  webviewContainer: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#fcfbf7' },
  settings: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f1e8' },
  card: { backgroundColor: '#fff', padding: 30, borderRadius: 24, elevation: 5 },
  title: { fontSize: 24, fontWeight: '900', color: '#1e1b4b', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 12, fontWeight: 'bold', marginBottom: 8, color: '#6366f1' },
  input: { borderWidth: 1.5, borderColor: '#e2e8f0', padding: 15, borderRadius: 12, marginBottom: 20 },
  button: { backgroundColor: '#4f46e5', padding: 18, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  hint: { marginTop: 20, fontSize: 11, color: '#94a3b8', textAlign: 'center' },
  miniFab: { position: 'absolute', bottom: 30, right: 30, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 5 }
});
