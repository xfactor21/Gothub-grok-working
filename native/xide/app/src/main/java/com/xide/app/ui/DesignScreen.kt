package com.xide.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xide.app.design.DesignWriter
import com.xide.app.design.UiBlock
import com.xide.app.ui.theme.Accent
import com.xide.app.ui.theme.Border
import com.xide.app.ui.theme.Elevated
import com.xide.app.ui.theme.Fg
import com.xide.app.ui.theme.Muted
import com.xide.app.ui.theme.Pink
import com.xide.app.ui.theme.Subtle
import com.xide.app.ui.theme.Surface
import com.xide.app.vm.XideViewModel

@Composable
fun DesignScreen(vm: XideViewModel) {
    val id by vm.currentId.collectAsState()
    val project = vm.current()
    val blocks = remember { mutableStateListOf<UiBlock>() }

    LaunchedEffect(id) {
        blocks.clear()
        if (id != null) blocks.addAll(vm.loadDesign())
    }

    if (project == null || id == null) {
        Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) {
            Text("Open a project, then lay out its first screen here.", color = Muted)
        }
        return
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text("DESIGN", style = MaterialTheme.typography.labelSmall, color = Pink)
        Text(project.name, style = MaterialTheme.typography.headlineMedium)
        Text(
            "Drag a row to reorder. Write drops real Compose into the project — it does not pretend to be the running app.",
            color = Muted,
            fontSize = 13.sp,
            lineHeight = 18.sp,
        )
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DesignWriter.kinds.forEach { kind ->
                Text(
                    kind,
                    color = Fg,
                    fontSize = 13.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Elevated)
                        .border(1.dp, Border, RoundedCornerShape(8.dp))
                        .clickable {
                            val text = when (kind) {
                                "title" -> "Title"
                                "button" -> "Continue"
                                "spacer" -> "16"
                                else -> "Text"
                            }
                            blocks.add(UiBlock(kind, text))
                        }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Surface)
                .border(1.dp, Border, RoundedCornerShape(12.dp))
                .verticalScroll(rememberScrollState())
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (blocks.isEmpty()) {
                Text("Empty canvas. Add a title, text, or button.", color = Subtle, fontSize = 13.sp)
            }
            blocks.forEachIndexed { index, block ->
                BlockRow(
                    block = block,
                    onText = { blocks[index] = block.copy(text = it) },
                    onRemove = { blocks.removeAt(index) },
                    onDrag = { dy ->
                        if (dy > 36 && index < blocks.lastIndex) {
                            val item = blocks.removeAt(index)
                            blocks.add(index + 1, item)
                        } else if (dy < -36 && index > 0) {
                            val item = blocks.removeAt(index)
                            blocks.add(index - 1, item)
                        }
                    },
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                modifier = Modifier
                    .height(44.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Accent)
                    .clickable {
                        vm.writeDesign(blocks.toList())
                    }
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("Write into project", color = com.xide.app.ui.theme.AccentFg, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun BlockRow(
    block: UiBlock,
    onText: (String) -> Unit,
    onRemove: () -> Unit,
    onDrag: (Float) -> Unit,
) {
    var acc = remember { mutableFloatStateOf(0f) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Elevated)
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "≡",
            color = Pink,
            fontSize = 18.sp,
            modifier = Modifier.pointerInput(block) {
                detectDragGestures(
                    onDragEnd = { acc.floatValue = 0f },
                    onDrag = { change, drag ->
                        change.consume()
                        acc.floatValue += drag.y
                        if (acc.floatValue > 36f || acc.floatValue < -36f) {
                            onDrag(acc.floatValue)
                            acc.floatValue = 0f
                        }
                    },
                )
            },
        )
        Text(block.kind, color = Subtle, fontSize = 11.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(0.35f))
        BasicTextField(
            value = block.text,
            onValueChange = onText,
            textStyle = TextStyle(color = Fg, fontSize = 14.sp),
            cursorBrush = SolidColor(Accent),
            modifier = Modifier.weight(1f),
        )
        Text("×", color = Muted, fontSize = 18.sp, modifier = Modifier.clickable(onClick = onRemove))
    }
}
