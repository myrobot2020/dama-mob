import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { CorpusService } from '../services/corpus.service';
import { SuttaData, Message } from '../types/sutta.types';

export const ChatScreen: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeRef, setActiveRef] = useState<any>(null);
  const [selectedFolders, setSelectedFolders] = useState<number[]>([1,2,3,4,5,6,7,8,9,10,11]);
  const flatListRef = useRef<FlatList>(null);
  const corpus = CorpusService.getInstance();

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const renderMessageContent = (text: string, onCitePress: (suttaId: string) => void) => {
    const regex = /(\^an\d+\.\d+\.\d+)|(\[AN\s+\d+\.\d+\.\d+\])/gi;
    const parts: any[] = [];
    let lastIndex = 0, match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<Text key={`t${lastIndex}`} style={styles.messageText}>{text.slice(lastIndex, match.index)}</Text>);
      }
      const citation = match[0];
      const suttaId = citation.replace('^an', 'AN ').replace('[AN ', 'AN ').replace(']', '');
      parts.push(<Text key={`c${match.index}`} style={styles.citation} onPress={() => onCitePress(suttaId)}>{citation}</Text>);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(<Text key="tend" style={styles.messageText}>{text.slice(lastIndex)}</Text>);
    }
    return parts;
  };

  const handleCitePress = async (suttaId: string) => {
    const sutta = await corpus.fetchSutta(suttaId);
    if (sutta) setActiveRef({ sutta, kind: 'sutta' });
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: inputText }]);
    setInputText('');
    setIsLoading(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: 'assistant', content: 'According to ^an1.20.2, even a finger-snap of jhāna is valuable. See also [AN 6.5.44].' }]);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>DAMA Chat</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bookList}>
          {[1,2,3,4,5,6,7,8,9,10,11].map(b => (
            <TouchableOpacity key={b} onPress={() => setSelectedFolders(selectedFolders.includes(b) ? selectedFolders.filter(x=>x!==b) : [...selectedFolders,b])} style={[styles.bookButton, selectedFolders.includes(b) && styles.bookButtonActive]}>
              <Text style={styles.bookButtonText}>AN {b}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      <FlatList ref={flatListRef} data={messages} keyExtractor={item=>item.id} style={styles.messageList} contentContainerStyle={styles.messageListContent} renderItem={({item}) => (
        <View style={[styles.messageRow, item.role === 'user' ? styles.userRow : styles.assistantRow]}>
          <View style={[styles.messageBubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            {item.role === 'assistant' ? renderMessageContent(item.content, handleCitePress) : <Text style={styles.messageText}>{item.content}</Text>}
          </View>
        </View>
      )} />
      
      {activeRef && (
        <View style={styles.referencePanel}>
          <View style={styles.referenceHeader}>
            <Text style={styles.referenceTitle}>📖 {activeRef.kind === 'sutta' ? 'SUTTA' : 'COMMENTARY'}</Text>
            <TouchableOpacity onPress={() => setActiveRef(null)}><Text style={styles.referenceClose}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView><Text style={styles.referenceText}>{activeRef.sutta.sutta}</Text></ScrollView>
        </View>
      )}
      
      <View style={styles.inputBar}>
        <TextInput style={styles.input} placeholder="Ask about Dhamma..." placeholderTextColor="#64748b" value={inputText} onChangeText={setInputText} multiline />
        <TouchableOpacity onPress={sendMessage} disabled={isLoading} style={styles.sendButton}>
          {isLoading ? <ActivityIndicator color="white" /> : <Text style={styles.sendButtonText}>📤</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#1e293b', backgroundColor: '#0f172a' },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 18, marginBottom: 8 },
  bookList: { flexDirection: 'row' },
  bookButton: { marginRight: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: '#334155' },
  bookButtonActive: { backgroundColor: '#059669' },
  bookButtonText: { color: 'white', fontSize: 10 },
  messageList: { flex: 1 },
  messageListContent: { paddingHorizontal: 16, paddingVertical: 8 },
  messageRow: { marginVertical: 4 },
  userRow: { alignItems: 'flex-end' },
  assistantRow: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '85%', padding: 12, borderRadius: 16 },
  userBubble: { backgroundColor: '#4f46e5' },
  assistantBubble: { backgroundColor: '#1e293b' },
  messageText: { color: '#e2e8f0', fontSize: 14, lineHeight: 20 },
  citation: { color: '#34d399', textDecorationLine: 'underline', fontSize: 12 },
  referencePanel: { margin: 16, padding: 16, backgroundColor: '#0f172a', borderRadius: 12, borderWidth: 1, borderColor: '#334155', maxHeight: 320 },
  referenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  referenceTitle: { color: '#34d399', fontWeight: 'bold', fontSize: 10 },
  referenceClose: { color: '#94a3b8', fontSize: 18 },
  referenceText: { color: '#e2e8f0', fontSize: 14, lineHeight: 24 },
  inputBar: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#1e293b', backgroundColor: '#0f172a' },
  input: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, color: 'white', fontSize: 14 },
  sendButton: { marginLeft: 8, width: 40, height: 40, backgroundColor: '#059669', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sendButtonText: { color: 'white', fontSize: 20 },
});
