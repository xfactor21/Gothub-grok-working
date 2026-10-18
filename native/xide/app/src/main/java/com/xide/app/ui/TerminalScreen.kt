package com.xide.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xide.app.ui.theme.Accent
import com.xide.app.ui.theme.AccentFg
import com.xide.app.ui.theme.Border
import com.xide.app.ui.theme.Fg
import com.xide.app.ui.theme.Muted
import com.xide.app.ui.theme.Ok
import com.xide.app.ui.theme.Surface
import com.xide.app.vm.XideViewModel

@Composable
fun TerminalScreen(vm: XideViewModel) {
    val logs by vm.logs.collectAsState()
    val project = vm.current()
    var line by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    LaunchedEffect(logs.size) {
        if (logs.isNotEmpty()) listState.animateScrollToItem(logs.lastIndex)
    }
    Column(Modifier.fillMaxSize().imePadding().padding(12.dp)) {
        Text("TERMINAL", style = MaterialTheme.typography.labelSmall)
        Text(project?.name ?: "No project — shell starts in app storage", style = MaterialTheme.typography.headlineMedium)
        Text("Real shell on this phone. java and aapt2 are on PATH after Download SDK.", color = Muted, fontSize = 13.sp)
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(vertical = 8.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(Surface)
                .border(1.dp, Border, RoundedCornerShape(10.dp)),
        ) {
            if (logs.isEmpty()) {
                Text("Ready.", color = Ok, fontFamily = FontFamily.Monospace, fontSize = 12.sp, modifier = Modifier.padding(12.dp))
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize().padding(10.dp)) {
                    items(logs.size) { i ->
                        Text(logs[i], color = Fg, fontFamily = FontFamily.Monospace, fontSize = 11.sp, lineHeight = 16.sp)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            BasicTextField(
                value = line,
                onValueChange = { line = it },
                textStyle = TextStyle(color = Fg, fontFamily = FontFamily.Monospace, fontSize = 14.sp),
                cursorBrush = SolidColor(Accent),
                modifier = Modifier
                    .weight(1f)
                    .height(44.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Surface)
                    .border(1.dp, Border, RoundedCornerShape(8.dp))
                    .padding(horizontal = 12.dp, vertical = 12.dp),
                decorationBox = { inner ->
                    if (line.isEmpty()) Text("java -version", color = Muted, fontFamily = FontFamily.Monospace, fontSize = 14.sp)
                    inner()
                },
            )
            Box(
                modifier = Modifier
                    .height(44.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Accent)
                    .clickable {
                        val cmd = line
                        line = ""
                        vm.runShell(cmd)
                    }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("Run", color = AccentFg, fontSize = 14.sp)
            }
        }
    }
}
