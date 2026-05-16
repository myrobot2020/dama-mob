import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { ChatScreen } from './src/screens/ChatScreen';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />
      <ChatScreen />
    </SafeAreaView>
  );
}
