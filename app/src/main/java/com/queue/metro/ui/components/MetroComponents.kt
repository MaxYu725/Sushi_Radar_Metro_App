package com.queue.metro.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.queue.metro.data.QueueSnapshot
import com.queue.metro.data.Store
import com.queue.metro.ui.LocalMetroColors
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

@Composable
fun MetroButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = LocalMetroColors.current
    Box(
        modifier = modifier
            .height(48.dp)
            .border(2.dp, if (enabled) colors.line else colors.line.copy(alpha = .45f))
            .combinedClickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = if (enabled) colors.foreground else colors.muted,
            fontSize = 15.sp,
            fontWeight = FontWeight.Normal,
        )
    }
}

@Composable
fun MetroSectionLabel(text: String, modifier: Modifier = Modifier) {
    val colors = LocalMetroColors.current
    Text(
        text = text.uppercase(),
        color = colors.accent,
        fontSize = 12.sp,
        letterSpacing = 1.8.sp,
        modifier = modifier,
    )
}

@Composable
fun MetroDivider(modifier: Modifier = Modifier) {
    val colors = LocalMetroColors.current
    Spacer(modifier = modifier.fillMaxWidth().height(1.dp).background(colors.line))
}

@Composable
fun EmptyPanel(title: String, message: String, modifier: Modifier = Modifier) {
    val colors = LocalMetroColors.current
    Column(
        modifier = modifier.fillMaxWidth().border(1.dp, colors.line).padding(26.dp),
        horizontalAlignment = Alignment.Start,
    ) {
        Text(title, color = colors.foreground, fontSize = 23.sp, fontWeight = FontWeight.Light)
        Spacer(Modifier.height(8.dp))
        Text(message, color = colors.muted, fontSize = 14.sp, lineHeight = 20.sp)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun QueueTile(
    store: Store,
    snapshot: QueueSnapshot?,
    onLongPressAction: () -> Unit,
    longPressLabel: String,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    val colors = LocalMetroColors.current
    var expanded by remember(store.id) { mutableStateOf(false) }
    var showMenu by remember { mutableStateOf(false) }
    val tileHeight by animateDpAsState(
        targetValue = when {
            compact -> 150.dp
            expanded -> 232.dp
            else -> 168.dp
        },
        label = "tileHeight",
    )
    val seed = remember(store.id) { store.id.hashCode() }
    val tileColor = colors.accent.shiftForSeed(seed)
    val onTile = if (tileColor.luminance() > .55f) Color.Black else Color.White

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(tileHeight)
            .background(tileColor)
            .combinedClickable(
                role = Role.Button,
                onClick = { if (!compact) expanded = !expanded },
                onLongClick = { showMenu = true },
            ),
    ) {
        StableTilePattern(seed = seed, color = onTile.copy(alpha = .12f))
        Column(
            modifier = Modifier.fillMaxSize().padding(if (compact) 14.dp else 20.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text(
                    text = store.name,
                    color = onTile,
                    fontSize = if (compact) 18.sp else 22.sp,
                    fontWeight = FontWeight.Normal,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!compact) {
                    Text(
                        text = store.district,
                        color = onTile.copy(alpha = .72f),
                        fontSize = 13.sp,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text(
                        text = snapshot?.currentNumbers?.firstOrNull() ?: "—",
                        color = onTile,
                        fontSize = if (compact) 31.sp else 48.sp,
                        fontWeight = FontWeight.Light,
                    )
                    Text("現正叫號", color = onTile.copy(alpha = .74f), fontSize = 12.sp)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = snapshot?.waitingGroups?.toString() ?: "—",
                        color = onTile,
                        fontSize = if (compact) 31.sp else 52.sp,
                        fontWeight = FontWeight.Light,
                    )
                    Text("輪候組數", color = onTile.copy(alpha = .74f), fontSize = 12.sp)
                }
            }
            AnimatedVisibility(
                visible = expanded && !compact,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = snapshot?.currentNumbers?.drop(1)?.joinToString("  ")
                            ?.ifBlank { "沒有其他叫號" } ?: "暫時沒有叫號資料",
                        color = onTile.copy(alpha = .88f),
                        fontSize = 14.sp,
                    )
                    Text(
                        text = snapshot?.let(::formatSnapshotTime) ?: "尚未更新",
                        color = onTile.copy(alpha = .72f),
                        fontSize = 12.sp,
                    )
                }
            }
        }
        if (snapshot?.isStale == true) {
            Box(
                Modifier.align(Alignment.TopEnd).background(Color.Black.copy(alpha = .68f)).padding(8.dp, 5.dp),
            ) {
                Text("離線資料", color = Color.White, fontSize = 11.sp)
            }
        }
        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            containerColor = colors.surface,
        ) {
            DropdownMenuItem(
                text = { Text(longPressLabel, color = colors.foreground) },
                onClick = {
                    showMenu = false
                    onLongPressAction()
                },
            )
        }
    }
}

@Composable
private fun BoxScope.StableTilePattern(seed: Int, color: Color) {
    Canvas(modifier = Modifier.matchParentSize()) {
        val random = Random(seed)
        repeat(7) { index ->
            val x = size.width * (random.nextFloat() * .9f - .12f)
            val y = (16 + index * 39 + random.nextInt(-18, 18)).dp.toPx()
            val width = size.width * (.18f + random.nextFloat() * .31f)
            val height = (44 + random.nextInt(18, 88)).dp.toPx()
            rotate(
                degrees = random.nextInt(-28, 29).toFloat(),
                pivot = Offset(x + width / 2f, y + height / 2f),
            ) {
                if (index % 3 == 0) {
                    val path = Path().apply {
                        moveTo(x, y + height)
                        lineTo(x + width * .52f, y)
                        lineTo(x + width, y + height)
                        close()
                    }
                    drawPath(path, color)
                } else {
                    drawRect(color, topLeft = Offset(x, y), size = Size(width, height))
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MetroChoice(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalMetroColors.current
    Box(
        modifier = modifier
            .height(48.dp)
            .border(2.dp, if (selected) colors.accent else colors.line)
            .selectable(selected = selected, onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (selected) colors.accent else colors.foreground, fontSize = 14.sp)
    }
}

@Composable
fun MetroSwitch(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    val colors = LocalMetroColors.current
    Box(
        modifier = Modifier
            .width(58.dp)
            .height(30.dp)
            .background(if (checked) colors.accent else colors.line)
            .combinedClickable(
                indication = null,
                interactionSource = remember { MutableInteractionSource() },
                onClick = { onCheckedChange(!checked) },
            )
            .padding(4.dp),
    ) {
        Box(
            Modifier
                .align(if (checked) Alignment.CenterEnd else Alignment.CenterStart)
                .size(22.dp)
                .background(Color.White),
        )
    }
}

private fun Color.shiftForSeed(seed: Int): Color {
    val factor = when ((seed % 5 + 5) % 5) {
        0 -> .72f
        1 -> .84f
        2 -> .96f
        3 -> 1.08f
        else -> 1.18f
    }
    return Color(
        red = (red * factor).coerceIn(0f, 1f),
        green = (green * factor).coerceIn(0f, 1f),
        blue = (blue * factor).coerceIn(0f, 1f),
        alpha = alpha,
    )
}

private fun formatSnapshotTime(snapshot: QueueSnapshot): String {
    val formatter = SimpleDateFormat("HH:mm", Locale.TRADITIONAL_CHINESE)
    return "${formatter.format(Date(snapshot.sourceUpdatedAt))} 更新"
}
