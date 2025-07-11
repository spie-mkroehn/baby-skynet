# Database Auto-Upgrade Funktionalität

## 🔄 **Intelligenter SQLite → PostgreSQL Upgrade**

Baby-SkyNet kann jetzt automatisch von SQLite auf PostgreSQL wechseln, wenn Container verfügbar werden.

### **Workflow:**

1. **Server Start ohne Container**:
   ```
   npm start
   ```
   → Server startet mit SQLite-Fallback
   → Tools sind sofort verfügbar

2. **Container starten**:
   ```bash
   # Windows
   start-containers.bat
   
   # macOS/Linux  
   ./start-containers-*.sh
   ```

3. **Auto-Upgrade auslösen**:
   - `memory_status` Tool mit `autostart=true` verwenden
   - Server erkennt verfügbare Container
   - Automatischer Switch von SQLite zu PostgreSQL

### **Was passiert beim Upgrade:**

✅ **PostgreSQL Container Check** - Verfügbarkeit prüfen  
✅ **Health Check** - Datenbankverbindung testen  
✅ **SQLite schließen** - Alte Verbindung sauber beenden  
✅ **PostgreSQL aktivieren** - Neue Verbindung etablieren  
✅ **Components Update** - JobProcessor, Analyzer neu verlinken  
✅ **External Clients** - ChromaDB, Neo4j neu verknüpfen  

### **Status-Anzeige:**

Das `memory_status` Tool zeigt jetzt:
```
🗄️ SQL Database: ✅ Connected (PostgreSQL)
🔄 Successfully upgraded from SQLite to PostgreSQL!
🎉 Full database functionality now available
```

### **Fallback-Verhalten:**

- **Upgrade erfolgreich** → Alle Features verfügbar
- **Upgrade fehlgeschlagen** → Weiter mit SQLite, keine Unterbrechung
- **Bereits PostgreSQL** → Keine Aktion nötig

### **Logs:**

```
[INFO] Currently using SQLite - attempting PostgreSQL upgrade...
[INFO] PostgreSQL container is now available - attempting upgrade...
[INFO] Testing PostgreSQL connection...
[SUCCESS] Successfully upgraded from SQLite to PostgreSQL!
[SUCCESS] All components updated with new PostgreSQL database
```

### **Automatisierungsvorschlag:**

Für den besten Workflow:

1. **Container-Skript in Autostart** (optional)
2. **Baby-SkyNet normal starten** - funktioniert immer
3. **memory_status mit autostart=true** - für vollständige Funktionalität

Diese Lösung bietet **Best of Both Worlds**:
- ✅ **Sofortige Verfügbarkeit** (SQLite)
- ✅ **Vollständige Funktionalität** (PostgreSQL nach Container-Start)
- ✅ **Keine Service-Unterbrechung** beim Upgrade

---

*Die Auto-Upgrade-Funktionalität macht Baby-SkyNet noch robuster und benutzerfreundlicher! 🚀*
